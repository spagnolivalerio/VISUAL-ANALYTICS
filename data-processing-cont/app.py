from pathlib import Path

import pandas as pd
from flask import Flask, jsonify, request

BASE_DIR = Path(__file__).resolve().parent
WINE_PATH = BASE_DIR / "data" / "wine.csv"

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify(status="ok"), 200


@app.get("/sample")
def sample_rows():
    n_raw = request.args.get("n", "10")
    try:
        n = int(n_raw)
    except ValueError:
        return jsonify(error="Parameter 'n' must be an integer"), 400

    if n <= 0:
        return jsonify(error="Parameter 'n' must be > 0"), 400

    df = pd.read_csv(WINE_PATH, sep=";", decimal=",")
    if n > len(df):
        return jsonify(error=f"Parameter 'n' must be <= {len(df)}"), 400

    sampled = df.sample(n=n, replace=False)
    return jsonify(
        count=n,
        total_rows=len(df),
        rows=sampled.to_dict(orient="records"),
    ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
