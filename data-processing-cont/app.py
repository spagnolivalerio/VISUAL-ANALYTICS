from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from sklearn.manifold import MDS
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parent
WINE_PATH = BASE_DIR / "data" / "wine.csv"

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


@app.get("/health")
def health():
    return jsonify(status="ok"), 200

@app.get("/mds-classic")
def mds_classic():
    df = pd.read_csv(WINE_PATH, sep=";", decimal=",")
    label_col = "Class label"
    features = df.drop(columns=[label_col])
    scaled = StandardScaler().fit_transform(features)

    mds = build_mds(n_components=2, metric=True, random_state=200)
    embedding = mds.fit_transform(scaled)

    points = [
        {
            "id": int(i + 1),
            "x": float(embedding[i, 0]),
            "y": float(embedding[i, 1]),
            "class_label": int(df.iloc[i][label_col]),
        }
        for i in range(len(df))
    ]

    return jsonify(
        count=len(points),
        stress=float(mds.stress_),
        points=points,
    ), 200

@app.get("/numeric-attributes")
def numeric_attributes():
    df = pd.read_csv(WINE_PATH, sep=";", decimal=",")
    label_col = "Class label"
    feature_df = df.drop(columns=[label_col], errors="ignore")
    numeric_attributes = feature_df.select_dtypes(include="number").columns.tolist()

    return jsonify(
        numeric_attributes=numeric_attributes,
    ), 200

@app.post("/mds-nonprop")
def mds_nonprop():
    payload = request.get_json(silent=True) or {}
    weights_payload = payload.get("weights")
    if weights_payload is None:
        return jsonify(error="Missing JSON field 'weights'"), 400

    df = pd.read_csv(WINE_PATH, sep=";", decimal=",")
    label_col = "Class label"
    features = df.drop(columns=[label_col], errors="ignore")
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

    points = [
        {
            "id": int(i + 1),
            "x": float(embedding[i, 0]),
            "y": float(embedding[i, 1]),
            "class_label": int(df.iloc[i][label_col]),
        }
        for i in range(n_samples)
    ]

    return jsonify(
        count=len(points),
        stress=float(mds.stress_),
        attributes=attributes,
        weights=weights.tolist(),
        points=points,
    ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
