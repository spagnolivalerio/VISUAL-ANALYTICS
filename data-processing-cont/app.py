from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from sklearn.cluster import KMeans
from sklearn.manifold import MDS
from sklearn.preprocessing import StandardScaler

DEFAULT_CLUSTER_ATTR = "Class label"
SEED = 200

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data"
WINE_PATH = DATA_PATH / "wine.csv"

app = Flask(__name__)


def create_metric_mds():
    try:
        return MDS(
            normalized_stress="auto",
            n_init=4,
            init="random",
            n_components=2,
            metric=True,
            random_state=SEED,
        )
    except TypeError:
        return MDS(n_init=4, init="random", n_components=2, metric=True, random_state=SEED)


def create_precomputed_mds():
    try:
        return MDS(
            normalized_stress="auto",
            n_init=4,
            init="random",
            n_components=2,
            metric="precomputed",
            random_state=SEED,
        )
    except (TypeError, ValueError):
        return MDS(
            n_init=4,
            init="random",
            n_components=2,
            dissimilarity="precomputed",
            random_state=SEED,
        )


def resolve_dataset_path(dataset_name):
    if not dataset_name:
        return WINE_PATH

    dataset = DATA_PATH / dataset_name
    if not dataset.exists() or not dataset.is_file():
        raise FileNotFoundError(f"Unknown dataset '{dataset_name}'")
    return dataset


def get_request_payload():
    return request.get_json(silent=True) or {}


def resolve_request_context(payload):
    return {
        "requested_cluster_attr": payload.get("cluster_attr"),
        "dataset": resolve_dataset_path(payload.get("dataset")),
    }


def bad_request(message, extra_fields=None):
    payload = {"error": message}
    if extra_fields:
        payload.update(extra_fields)
    return jsonify(payload), 400


def load_dataframe(dataset_path):
    return pd.read_csv(dataset_path, sep=None, engine="python", decimal=",")


def infer_default_cluster_attr(df):
    if df.empty and not len(df.columns):
        raise ValueError("Dataset has no columns")

    if DEFAULT_CLUSTER_ATTR in df.columns:
        return DEFAULT_CLUSTER_ATTR

    categorical_columns = [
        column
        for column in df.columns
        if not pd.api.types.is_numeric_dtype(df[column])
    ]
    if categorical_columns:
        return categorical_columns[0]

    return df.columns[0]


def resolve_cluster_attr(df, requested_cluster_attr=None):
    if requested_cluster_attr is None:
        return infer_default_cluster_attr(df)

    if requested_cluster_attr not in df.columns:
        raise ValueError(f"Unknown cluster_attr '{requested_cluster_attr}'")

    return requested_cluster_attr


def get_numeric_feature_columns(df, cluster_attr):
    if df.empty:
        raise ValueError("Dataset is empty")

    sample_row = df.sample(n=1, random_state=SEED).iloc[0]
    candidate_columns = [column for column in df.columns if column != cluster_attr]
    numeric_columns = []
    for column in candidate_columns:
        if pd.notna(pd.to_numeric(sample_row[column], errors="coerce")):
            numeric_columns.append(column)
    if not numeric_columns:
        raise ValueError("No numeric attributes available")
    return numeric_columns


def get_numeric_features(df, cluster_attr):
    numeric_columns = get_numeric_feature_columns(df, cluster_attr)
    return df[numeric_columns].apply(pd.to_numeric, errors="coerce"), numeric_columns


def scale_features(features):
    return StandardScaler().fit_transform(features)


def load_dataset_context(payload):
    context = resolve_request_context(payload)
    df = load_dataframe(context["dataset"])
    cluster_attr = resolve_cluster_attr(df, context["requested_cluster_attr"])
    return df, cluster_attr


def load_numeric_dataset_context(payload):
    df, cluster_attr = load_dataset_context(payload)
    numeric_features, attributes = get_numeric_features(df, cluster_attr)
    return df, cluster_attr, numeric_features, attributes


def build_points(embedding, label_values):
    return [
        {
            "id": int(index + 1),
            "x": float(embedding[index, 0]),
            "y": float(embedding[index, 1]),
            "class_label": label_values[index],
        }
        for index in range(len(label_values))
    ]


def build_kmeans_legend_labels(k_value):
    return [f"Cluster {index + 1}" for index in range(k_value)]


def validate_k_value(k_value, n_samples):
    if n_samples < 2:
        raise ValueError("KMeans requires at least two rows.")
    if k_value < 2:
        raise ValueError("'k' must be at least 2")
    if k_value > n_samples:
        raise ValueError(f"'k' must be less than or equal to the number of rows ({n_samples})")


def avg_pairwise_distance(items_a, items_b=None):
    if items_b is None:
        n_items = len(items_a)
        if n_items < 2:
            return 0.0

        total = 0.0
        count = 0
        for i in range(n_items):
            for j in range(i + 1, n_items):
                dx = items_a[i]["x"] - items_a[j]["x"]
                dy = items_a[i]["y"] - items_a[j]["y"]
                total += (dx * dx + dy * dy) ** 0.5
                count += 1
        return total / count

    if not items_a or not items_b:
        return 0.0

    total = 0.0
    count = 0
    for item_a in items_a:
        for item_b in items_b:
            dx = item_a["x"] - item_b["x"]
            dy = item_a["y"] - item_b["y"]
            total += (dx * dx + dy * dy) ** 0.5
            count += 1
    return total / count


def build_cluster_points(points):
    cluster_points = {}
    for point in points:
        cluster_points.setdefault(point["class_label"], []).append(point)
    return cluster_points


def compute_cluster_metrics(points, label_values):
    cluster_points = build_cluster_points(points)

    cohesion = {
        str(label): float(avg_pairwise_distance(items))
        for label, items in cluster_points.items()
    }

    separation = {}
    labels = list(dict.fromkeys(label_values))
    for index, label_a in enumerate(labels):
        for label_b in labels[index + 1 :]:
            key = f"{label_a}-{label_b}"
            separation[key] = float(
                avg_pairwise_distance(cluster_points[label_a], cluster_points[label_b])
            )

    return cohesion, separation


def compute_ratio(cohesion, separation):
    cohesion_values = [float(value) for value in cohesion.values() if value is not None]
    separation_values = [float(value) for value in separation.values() if value is not None]
    if not cohesion_values or not separation_values:
        return 0.0

    mean_cohesion = float(np.mean(cohesion_values))
    mean_separation = float(np.mean(separation_values))
    if mean_separation == 0:
        return 0.0

    return mean_cohesion / mean_separation


def parse_weights(weights_payload, attributes):
    if isinstance(weights_payload, list):
        if len(weights_payload) != len(attributes):
            raise ValueError(f"'weights' must contain {len(attributes)} values")
        weights = np.array(weights_payload, dtype=float)
    elif isinstance(weights_payload, dict):
        try:
            weights = np.array([weights_payload[attr] for attr in attributes], dtype=float)
        except KeyError as exc:
            raise ValueError(f"Missing weight for attribute '{exc.args[0]}'") from exc
    else:
        raise ValueError("'weights' must be a list or an object")

    if np.any(np.isnan(weights)):
        raise ValueError("'weights' contains non-numeric values")
    if np.any((weights < 0) | (weights > 1)):
        raise ValueError("'weights' values must be between 0 and 1")
    return weights


def compute_weighted_dissimilarities(scaled_features, weights):
    n_samples = scaled_features.shape[0]
    dissimilarities = np.zeros((n_samples, n_samples), dtype=float)

    for i in range(n_samples):
        for j in range(i + 1, n_samples):
            diff = scaled_features[i] - scaled_features[j]
            distance = np.sqrt(np.sum(weights * (diff ** 2)))
            dissimilarities[i, j] = distance
            dissimilarities[j, i] = distance

    return dissimilarities


def project_metric_mds(scaled_features):
    mds = create_metric_mds()
    return mds, mds.fit_transform(scaled_features)


def project_weighted_mds(scaled_features, weights):
    dissimilarities = compute_weighted_dissimilarities(scaled_features, weights)
    mds = create_precomputed_mds()
    return mds, mds.fit_transform(dissimilarities)


def build_mds_response(mds, cluster_attr, points, cohesion, separation, extra_fields=None):
    payload = {
        "count": len(points),
        "stress": float(mds.stress_),
        "cluster_attr": cluster_attr,
        "cluster_cohesion": cohesion,
        "cluster_separation": separation,
        "ratio": compute_ratio(cohesion, separation),
        "points": points,
    }
    if extra_fields:
        payload.update(extra_fields)
    return payload


def build_projection_response(mds, cluster_attr, embedding, label_values, extra_fields=None):
    points = build_points(embedding, label_values)
    cohesion, separation = compute_cluster_metrics(points, label_values)
    return build_mds_response(
        mds,
        cluster_attr,
        points,
        cohesion,
        separation,
        extra_fields,
    )


@app.get("/health")
def health():
    return jsonify(status="ok"), 200


@app.get("/dataset")
def list_datasets():
    if not DATA_PATH.exists():
        return jsonify(datasets=[]), 200

    datasets = sorted(path.name for path in DATA_PATH.iterdir() if path.is_file())
    return jsonify(datasets=datasets), 200


@app.post("/numeric-attributes")
def numeric_attributes():
    payload = get_request_payload()

    try:
        df, cluster_attr = load_dataset_context(payload)
        numeric_attributes = get_numeric_feature_columns(df, cluster_attr)
    except FileNotFoundError as exc:
        return bad_request(str(exc))
    except ValueError as exc:
        return bad_request(str(exc))

    return jsonify(numeric_attributes=numeric_attributes, cluster_attr=cluster_attr), 200


@app.post("/all_attributes")
def get_attributes():
    payload = get_request_payload()

    try:
        df, cluster_attr = load_dataset_context(payload)
    except FileNotFoundError as exc:
        return bad_request(str(exc))
    except ValueError as exc:
        return bad_request(str(exc))

    return jsonify(attributes=df.columns.tolist(), cluster_attr=cluster_attr), 200


@app.post("/mds-nonprop")
def mds_nonprop():
    payload = get_request_payload()
    weights_payload = payload.get("weights")
    attributes = []
    if weights_payload is None:
        return bad_request("Missing JSON field 'weights'")

    try:
        df, cluster_attr, numeric_features, attributes = load_numeric_dataset_context(payload)
        weights = parse_weights(weights_payload, attributes)
    except FileNotFoundError as exc:
        return bad_request(str(exc))
    except ValueError as exc:
        if "weights" in str(exc) or "Missing weight" in str(exc):
            return bad_request(str(exc), {"expected_attributes": attributes})
        return bad_request(str(exc))

    scaled = scale_features(numeric_features.to_numpy())
    mds, embedding = project_weighted_mds(scaled, weights)

    return jsonify(
        build_projection_response(
            mds,
            cluster_attr,
            embedding,
            df[cluster_attr].tolist(),
        )
    ), 200


@app.post("/kmeans")
def kmeans():
    payload = get_request_payload()

    try:
        _, cluster_attr, numeric_features, _ = load_numeric_dataset_context(payload)
        k_value = int(payload.get("k", 0))
    except FileNotFoundError as exc:
        return bad_request(str(exc))
    except ValueError as exc:
        return bad_request(str(exc))

    try:
        validate_k_value(k_value, int(len(numeric_features.index)))
    except ValueError as exc:
        return bad_request(str(exc))

    scaled = scale_features(numeric_features.to_numpy())
    mds, embedding = project_metric_mds(scaled)
    estimator = KMeans(n_clusters=k_value, random_state=SEED, n_init=10)
    estimator.fit(scaled)

    legend_labels = build_kmeans_legend_labels(k_value)
    label_values = [legend_labels[int(label)] for label in estimator.labels_.tolist()]

    return jsonify(
        build_projection_response(
            mds,
            cluster_attr,
            embedding,
            label_values,
            {
                "k": k_value,
                "legend_labels": legend_labels,
            },
        )
    ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
