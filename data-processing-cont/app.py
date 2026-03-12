from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from sklearn.manifold import MDS
from sklearn.preprocessing import StandardScaler

DEFAULT_CLUSTER_ATTR = "Class label"
SEED = 200

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data"
WINE_PATH = DATA_PATH / "wine.csv"

app = Flask(__name__)


def build_mds(**kwargs):
    try:
        return MDS(normalized_stress="auto", n_init=4, init="random", **kwargs)
    except TypeError:
        return MDS(n_init=4, init="random", **kwargs)


def build_precomputed_mds(**kwargs):
    try:
        return build_mds(metric="precomputed", **kwargs)
    except (TypeError, ValueError):
        return build_mds(dissimilarity="precomputed", **kwargs)


def resolve_dataset_path(dataset_name):
    if not dataset_name:
        return WINE_PATH

    dataset = DATA_PATH / dataset_name
    if not dataset.exists() or not dataset.is_file():
        raise FileNotFoundError(f"Unknown dataset '{dataset_name}'")
    return dataset


def get_request_payload():
    return request.get_json(silent=True) or {}


def resolve_mds_context(payload):
    return {
        "cluster_attr": payload.get("cluster_attr", DEFAULT_CLUSTER_ATTR),
        "dataset": resolve_dataset_path(payload.get("dataset")),
    }


def load_dataframe(dataset_path):
    return pd.read_csv(dataset_path, sep=None, engine="python", decimal=",")


def ensure_cluster_attr_exists(df, cluster_attr):
    if cluster_attr not in df.columns:
        raise ValueError(f"Unknown cluster_attr '{cluster_attr}'")


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
        raise ValueError("No numeric attributes available for MDS")
    return numeric_columns


def get_numeric_features(df, cluster_attr):
    numeric_columns = get_numeric_feature_columns(df, cluster_attr)
    return df[numeric_columns].apply(pd.to_numeric, errors="coerce"), numeric_columns


def scale_features(features):
    return StandardScaler().fit_transform(features)


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


def build_mds_response(*, mds, cluster_attr, points, cohesion, separation, extra_fields=None):
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


@app.get("/health")
def health():
    return jsonify(status="ok"), 200


@app.get("/dataset")
def list_datasets():
    if not DATA_PATH.exists():
        return jsonify(datasets=[]), 200

    datasets = sorted(path.name for path in DATA_PATH.iterdir() if path.is_file())
    return jsonify(datasets=datasets), 200


@app.post("/mds-classic")
def mds_classic():
    payload = get_request_payload()

    try:
        context = resolve_mds_context(payload)
        df = load_dataframe(context["dataset"])
        cluster_attr = context["cluster_attr"]
        ensure_cluster_attr_exists(df, cluster_attr)
        features, _ = get_numeric_features(df, cluster_attr)
    except FileNotFoundError as exc:
        return jsonify(error=str(exc)), 400
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    scaled = scale_features(features)

    mds = build_mds(n_components=2, metric=True, random_state=SEED)
    embedding = mds.fit_transform(scaled)

    label_values = df[cluster_attr].tolist()
    points = build_points(embedding, label_values)
    cohesion, separation = compute_cluster_metrics(points, label_values)

    return jsonify(
        build_mds_response(
            mds=mds,
            cluster_attr=cluster_attr,
            points=points,
            cohesion=cohesion,
            separation=separation,
        )
    ), 200


@app.post("/numeric-attributes")
def numeric_attributes():
    payload = get_request_payload()
    cluster_attr = payload.get("cluster_attr", DEFAULT_CLUSTER_ATTR)

    try:
        dataset = resolve_dataset_path(payload.get("dataset"))
        df = load_dataframe(dataset)
        ensure_cluster_attr_exists(df, cluster_attr)
        numeric_attributes = get_numeric_feature_columns(df, cluster_attr)
    except FileNotFoundError as exc:
        return jsonify(error=str(exc)), 400
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    return jsonify(numeric_attributes=numeric_attributes), 200


@app.post("/all_attributes")
def get_attributes():
    payload = get_request_payload()

    try:
        dataset = resolve_dataset_path(payload.get("dataset"))
        df = load_dataframe(dataset)
    except FileNotFoundError as exc:
        return jsonify(error=str(exc)), 400

    return jsonify(attributes=df.columns.tolist()), 200


@app.post("/mds-nonprop")
def mds_nonprop():
    payload = get_request_payload()
    weights_payload = payload.get("weights")
    if weights_payload is None:
        return jsonify(error="Missing JSON field 'weights'"), 400

    try:
        context = resolve_mds_context(payload)
        df = load_dataframe(context["dataset"])
        cluster_attr = context["cluster_attr"]
        numeric_features, attributes = get_numeric_features(df, cluster_attr)
        weights = parse_weights(weights_payload, attributes)
    except FileNotFoundError as exc:
        return jsonify(error=str(exc)), 400
    except ValueError as exc:
        if "weights" in str(exc) or "Missing weight" in str(exc):
            return jsonify(error=str(exc), expected_attributes=attributes), 400
        return jsonify(error=str(exc)), 400

    scaled = scale_features(numeric_features.to_numpy())
    dissimilarities = compute_weighted_dissimilarities(scaled, weights)

    mds = build_precomputed_mds(n_components=2, random_state=SEED)
    embedding = mds.fit_transform(dissimilarities)

    label_values = df[cluster_attr].tolist()
    points = build_points(embedding, label_values)
    cohesion, separation = compute_cluster_metrics(points, label_values)

    return jsonify(
        build_mds_response(
            mds=mds,
            cluster_attr=cluster_attr,
            points=points,
            cohesion=cohesion,
            separation=separation,
            extra_fields={
                "attributes": attributes,
                "weights": weights.tolist(),
            },
        )
    ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
