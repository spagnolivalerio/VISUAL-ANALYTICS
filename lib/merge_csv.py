import pandas as pd

csv1 = "../winequality-red.csv"
csv2 = "../winequality-white.csv"

df1 = pd.read_csv(csv1)
df2 = pd.read_csv(csv2)

merged = pd.concat([df1, df2], ignore_index=True)

merged.to_csv("wine_merged.csv", index=False)
