from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from sklearn.manifold import MDS
from sklearn.preprocessing import StandardScaler

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
    
def avg_pairwise_distance(items_a, items_b=None):
        if items_b is None:
            n = len(items_a)
            if n < 2:
                return 0.0
            total = 0.0
            count = 0
            for i in range(n):
                for j in range(i + 1, n):
                    dx = items_a[i]["x"] - items_a[j]["x"]
                    dy = items_a[i]["y"] - items_a[j]["y"]
                    total += (dx * dx + dy * dy) ** 0.5
                    count += 1
            return total / count
        if not items_a or not items_b:
            return 0.0
        total = 0.0
        count = 0
        for a in items_a:
            for b in items_b:
                dx = a["x"] - b["x"]
                dy = a["y"] - b["y"]
                total += (dx * dx + dy * dy) ** 0.5
                count += 1
        return total / count

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

def compute_ratio(cohesion, separation):
    cohesion_values = [float(v) for v in cohesion.values() if v is not None]
    separation_values = [float(v) for v in separation.values() if v is not None]
    if not cohesion_values or not separation_values:
        return 0.0
    mean_cohesion = float(np.mean(cohesion_values))
    mean_separation = float(np.mean(separation_values))
    if mean_separation == 0:
        return 0.0
    return mean_cohesion / mean_separation

@app.get("/health")
def health():
    return jsonify(status="ok"), 200

@app.get("/datasets")
def list_datasets():
    if not DATA_PATH.exists():
        return jsonify(datasets=[]), 200
    datasets = sorted([p.name for p in DATA_PATH.iterdir() if p.is_file()])
    return jsonify(datasets=datasets), 200

@app.post("/mds-classic")
def mds_classic():

    payload = request.get_json(silent=True) or {}
    required_attr = ["cluster_attr", "dataset"]
    if not all(k in payload for k in required_attr):
        cluster_attr = "Class label"
        dataset = WINE_PATH
    else:
        cluster_attr = payload["cluster_attr"]
        dataset = DATA_PATH / payload["dataset"]

    df = pd.read_csv(dataset, sep=";", decimal=",")
    if cluster_attr not in df.columns:
        return jsonify(error=f"Unknown cluster_attr '{cluster_attr}'"), 400
    features = df.drop(columns=[cluster_attr])
    scaled = StandardScaler().fit_transform(features)

    mds = build_mds(n_components=2, metric=True, random_state=200)
    embedding = mds.fit_transform(scaled)

    points = [
        {
            "id": int(i + 1),
            "x": float(embedding[i, 0]),
            "y": float(embedding[i, 1]),
            "class_label": df.iloc[i][cluster_attr],
        }
        for i in range(len(df))
    ]

    # Cluster cohesion and separation metrics in MDS space
    cluster_points = {}
    for point in points:
        cluster_points.setdefault(point["class_label"], []).append(point)

    def avg_pairwise_distance(items_a, items_b=None):
        if items_b is None:
            n = len(items_a)
            if n < 2:
                return 0.0
            total = 0.0
            count = 0
            for i in range(n):
                for j in range(i + 1, n):
                    dx = items_a[i]["x"] - items_a[j]["x"]
                    dy = items_a[i]["y"] - items_a[j]["y"]
                    total += (dx * dx + dy * dy) ** 0.5
                    count += 1
            return total / count
        if not items_a or not items_b:
            return 0.0
        total = 0.0
        count = 0
        for a in items_a:
            for b in items_b:
                dx = a["x"] - b["x"]
                dy = a["y"] - b["y"]
                total += (dx * dx + dy * dy) ** 0.5
                count += 1
        return total / count

    cohesion = {
        str(label): float(avg_pairwise_distance(items))
        for label, items in cluster_points.items()
    }

    separation = {}
    label_values = df[cluster_attr].tolist()
    labels = list(dict.fromkeys(label_values))
    for i, label_a in enumerate(labels):
        for label_b in labels[i + 1 :]:
            key = f"{label_a}-{label_b}"
            separation[key] = float(
                avg_pairwise_distance(cluster_points[label_a], cluster_points[label_b])
            )

    ratio = compute_ratio(cohesion, separation)

    return jsonify(
        count=len(points),
        stress=float(mds.stress_),
        cluster_attr=cluster_attr,
        cluster_cohesion=cohesion,
        cluster_separation=separation,
        ratio=ratio,
        points=points,
    ), 200

@app.post("/numeric-attributes")
def numeric_attributes():
    payload = request.get_json(silent=True) or {}
    required_attr = ["cluster_attr", "dataset"]
    if not all(k in payload for k in required_attr):
        cluster_attr = "Class label"
        dataset = WINE_PATH
    else:
        cluster_attr = payload["cluster_attr"]
        dataset = DATA_PATH / payload["dataset"]
    
    df = pd.read_csv(dataset, sep=";", decimal=",")
    feature_df = df.drop(columns=[cluster_attr], errors="ignore")
    numeric_attributes = feature_df.select_dtypes(include="number").columns.tolist()

    return jsonify(
        numeric_attributes=numeric_attributes,
    ), 200

@app.post("/all_attributes")
def get_attributes():
    payload = request.get_json(silent=True) or {}
    if payload["dataset"]:
        dataset = DATA_PATH / payload["dataset"]
    else: 
        return jsonify({"error": "missing dataset"}), 400
    
    df = pd.read_csv(dataset, sep=";", decimal=",")
    attributes = df.columns.tolist()

    return jsonify(
        attributes=attributes,
    ), 200

@app.post("/mds-nonprop")
def mds_nonprop():
    
    payload = request.get_json(silent=True) or {}
    weights_payload = payload.get("weights")
    if weights_payload is None:
        return jsonify(error="Missing JSON field 'weights'"), 400
    required_attr = ["cluster_attr", "dataset"]
    if not all(k in payload for k in required_attr):
        cluster_attr = "Class label"
        dataset = WINE_PATH
    else:
        cluster_attr = payload["cluster_attr"]
        dataset = DATA_PATH / payload["dataset"]

    df = pd.read_csv(dataset, sep=";", decimal=",")
    features = df.drop(columns=[cluster_attr], errors="ignore")
    numeric_features = features.select_dtypes(include="number")
    attributes = numeric_features.columns.tolist()

    try:
        weights = parse_weights(weights_payload, attributes)
    except ValueError as exc:
        return jsonify(error=str(exc), expected_attributes=attributes), 400

    scaled = StandardScaler().fit_transform(numeric_features.to_numpy())
    n_samples = scaled.shape[0]
    dissimilarities = np.zeros((n_samples, n_samples), dtype=float)

    # Weighted Euclidean distance: sqrt(sum_i(w_i * (x_i - y_i)^2))
    for i in range(n_samples):
        for j in range(i + 1, n_samples):
            diff = scaled[i] - scaled[j]
            distance = np.sqrt(np.sum(weights * (diff ** 2)))
            dissimilarities[i, j] = distance
            dissimilarities[j, i] = distance

    mds = build_precomputed_mds(n_components=2, random_state=200)
    embedding = mds.fit_transform(dissimilarities)

    label_values = df[cluster_attr].tolist()
    points = []
    for i in range(n_samples):
        points.append(
            {
                "id": int(i + 1),
                "x": float(embedding[i, 0]),
                "y": float(embedding[i, 1]),
                "class_label": label_values[i],
            }
        )

    # Cluster cohesion and separation metrics in MDS space
    cluster_points = {}
    for point in points:
        cluster_points.setdefault(point["class_label"], []).append(point)

    cohesion = {
        str(label): float(avg_pairwise_distance(items))
        for label, items in cluster_points.items()
    }

    separation = {}
    labels = list(dict.fromkeys(label_values))
    for i, label_a in enumerate(labels):
        for label_b in labels[i + 1 :]:
            key = f"{label_a}-{label_b}"
            separation[key] = float(
                avg_pairwise_distance(cluster_points[label_a], cluster_points[label_b])
            )

    ratio = compute_ratio(cohesion, separation)

    return jsonify(
        count=len(points),
        stress=float(mds.stress_),
        cluster_attr=cluster_attr,
        attributes=attributes,
        weights=weights.tolist(),
        cluster_cohesion=cohesion,
        cluster_separation=separation,
        ratio=ratio,
        points=points,
    ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
