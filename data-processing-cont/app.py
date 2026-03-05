from pathlib import Path

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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
