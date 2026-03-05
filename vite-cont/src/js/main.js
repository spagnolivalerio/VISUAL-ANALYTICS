const output = document.getElementById("health-response");

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    output.textContent = `Response: ${JSON.stringify(data)}`;
  } catch (error) {
    output.textContent = `Request failed: ${error.message}`;
  }
}

loadHealth();
