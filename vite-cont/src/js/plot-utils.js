export function clearPlotContainer(container) {
  container.classList.remove("plot-placeholder");
  container.innerHTML = "";
}

export function setPlotPlaceholder(container, message) {
  container.classList.add("plot-placeholder");
  container.textContent = message;
}

export function isShowingCentroids(container) {
  return container.dataset.showCentroids === "true";
}

export function replaceResizeObserver(currentObserver, container, callback) {
  currentObserver?.disconnect();
  const observer = new ResizeObserver(callback);
  observer.observe(container);
  return observer;
}
