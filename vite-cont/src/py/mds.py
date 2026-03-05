import matplotlib
matplotlib.use("Agg")  # <- IMPORTANTISSIMO in container/headless

import matplotlib.pyplot as plt
from sklearn.manifold import MDS
from sklearn import preprocessing
import pandas
from pathlib import Path

def build_mds(**kwargs):
    # sklearn nuovi: metric_mds
    try:
        return MDS(normalized_stress="auto", n_init=4, init="random", **kwargs)
    except TypeError:
        return MDS(n_init=4, init="random", **kwargs)

if __name__ == "__main__":
    data_path = Path(__file__).resolve().parent.parent / "wine.csv"
    df = pandas.read_csv(data_path, sep=";", decimal=",")
    label_col = "Class label"

    std_scale = preprocessing.StandardScaler().fit(df.drop(columns=[label_col]))
    data = std_scale.transform(df.drop(columns=[label_col]))

    # usa metric_mds se disponibile, altrimenti metric (per compatibilità)
    try:
        mds = build_mds(n_components=2, metric_mds=True, random_state=200)
    except TypeError:
        mds = build_mds(n_components=2, metric=True, random_state=200)

    pos = mds.fit_transform(data)

    s = 30
    plt.figure()
    plt.scatter(pos[0:59, 0], pos[0:59, 1], color="red", s=s, lw=0)
    plt.scatter(pos[59:130, 0], pos[59:130, 1], color="green", s=s, lw=0)
    plt.scatter(pos[130:178, 0], pos[130:178, 1], color="blue", s=s, lw=0)
    plt.legend(["MDS Cluster 1", "MDS Cluster 2", "MDS Cluster 3"], loc="best")

    plt.tight_layout()
    plt.savefig("mds_wine_2d.png", dpi=200)
    plt.close()