import { setCurrentClusterAttr, setCurrentDataset } from "./app-context";

const sidebar = document.getElementById("app-sidebar");
const toggle = document.querySelector(".sidebar-toggle");
const closeBtn = document.querySelector(".sidebar-close");
const backdrop = document.querySelector(".sidebar-backdrop");
const datasetsList = document.getElementById("datasets-list");
const attributesList = document.getElementById("attributes-list");

function renderAttributes(list) {
  if (!attributesList) return;
  attributesList.innerHTML = "";
  if (!list.length) {
    attributesList.innerHTML = "<li>No attributes</li>";
    return;
  }
  list.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    if (name !== "Loading..." && name !== "Error loading attributes" && name !== "No attributes") {
      li.style.cursor = "pointer";
      li.addEventListener("click", () => {
        setCurrentClusterAttr(name);
        location.reload();
      });
    }
    attributesList.appendChild(li);
  });
}

if (datasetsList) {
  datasetsList.innerHTML = "<li>Loading...</li>";
  fetch("/api/dataset")
    .then((res) => res.json())
    .then((data) => {
      const datasets = Array.isArray(data.datasets) ? data.datasets : [];
      datasetsList.innerHTML = "";
      if (!datasets.length) {
        datasetsList.innerHTML = "<li>No datasets</li>";
        return;
      }
      datasets.forEach((name) => {
        const li = document.createElement("li");
        li.textContent = name;
        li.style.cursor = "pointer";
        li.addEventListener("click", () => {
          setCurrentDataset(name);
          setCurrentClusterAttr(null);
          renderAttributes(["Loading..."]);
          fetch("/api/all_attributes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataset: name }),
          })
            .then((res) => res.json())
            .then((attrData) => {
              const attrs = Array.isArray(attrData.attributes) ? attrData.attributes : [];
              renderAttributes(attrs);
            })
            .catch(() => {
              renderAttributes(["Error loading attributes"]);
            });
        });
        datasetsList.appendChild(li);
      });
    })
    .catch(() => {
      datasetsList.innerHTML = "<li>Error loading datasets</li>";
    });
}

if (sidebar && toggle && closeBtn && backdrop) {
  const open = () => {
    sidebar.classList.add("is-open");
    backdrop.classList.add("is-visible");
    toggle.setAttribute("aria-expanded", "true");
    sidebar.setAttribute("aria-hidden", "false");
    toggle.style.display = "none";
  };

  const close = () => {
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("is-visible");
    toggle.setAttribute("aria-expanded", "false");
    sidebar.setAttribute("aria-hidden", "true");
    toggle.style.display = "";
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (sidebar.classList.contains("is-open")) {
      close();
    } else {
      open();
    }
  });

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
}
