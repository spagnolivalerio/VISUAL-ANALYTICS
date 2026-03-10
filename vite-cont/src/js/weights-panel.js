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

function buildWeightRowWrapper(list, weightsList, attributes){
  if (weightsList == null){
  for (const attributeName of attributes) {
      list.appendChild(buildWeightRow(attributeName, 1));
    }
  } else {
    for (const attributeName of attributes) {
      list.appendChild(buildWeightRow(attributeName, weightsList[attributeName]));
    }
  }
}

export async function renderWeightsPanel(weightsList) {
  const list = document.getElementById("weights-list");
  const resetButton = document.getElementById("reset-weights-btn");
  if (!list) {
    return;
  }

  list.textContent = "Loading attributes...";

  try {
    const response = await fetch("/api/numeric-attributes", { method: "POST" });
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
    buildWeightRowWrapper(list, weightsList, attributes)

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        const sliders = list.querySelectorAll("input[type='range'][data-attribute]");
        sliders.forEach((slider) => {
          slider.value = "1";
          slider.dispatchEvent(new Event("input", { bubbles: true }));
        });
      });
    }

  } catch (error) {
    list.textContent = `Unable to load attributes: ${error.message}`;
  }
}
