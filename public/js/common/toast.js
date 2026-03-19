export function createToast(containerEl) {
  return function showToast(message, isError = false) {
    const item = document.createElement('div');
    item.className = `toast ${isError ? 'error' : ''}`;
    item.textContent = message;
    containerEl.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  };
}
