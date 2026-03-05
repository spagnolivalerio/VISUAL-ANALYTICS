function formatWeight(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function buildWeightRow(attributeName, initialValue = 1) {
  const safeId = attributeName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const row = document.createElement("div");
  row.className = "weight-row";

  const label = document.createElement("label");
  label.setAttribute("for", `weight-${safeId}`);
  label.textContent = attributeName;

  const value = document.createElement("span");
  value.className = "weight-value";
  value.textContent = formatWeight(initialValue);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "1";
  slider.step = "0.25";
  slider.value = String(initialValue);
  slider.id = `weight-${safeId}`;
  slider.className = "weight-slider";
  slider.dataset.attribute = attributeName;

  slider.addEventListener("input", () => {
    value.textContent = formatWeight(slider.value);
  });

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(slider);
  return row;
}

export async function renderWeightsPanel() {
  const list = document.getElementById("weights-list");
  if (!list) {
    return;
  }

  list.textContent = "Loading attributes...";

  try {
    const response = await fetch("/api/numeric-attributes");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const body = await response.text();
      throw new Error(`Expected JSON, got: ${body.slice(0, 120)}`);
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const attributes = payload.numeric_attributes || [];
    if (!attributes.length) {
      list.textContent = "No numeric attributes found.";
      return;
    }

    list.innerHTML = "";
    for (const attributeName of attributes) {
      list.appendChild(buildWeightRow(attributeName, 1));
    }
  } catch (error) {
    list.textContent = `Unable to load attributes: ${error.message}`;
  }
}
