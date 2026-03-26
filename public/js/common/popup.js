let popupZIndex = 100;

export function openPopup(node) {
  popupZIndex += 2;
  node.style.zIndex = String(popupZIndex);
  node.classList.remove('hidden');
}

export function closePopup(node) {
  node.classList.add('hidden');
}

export function attachPopupCloseHandlers(popupNodes, onClose) {
  popupNodes.forEach((popup) => {
    popup.addEventListener('mousedown', () => {
      if (!popup.classList.contains('hidden')) {
        popupZIndex += 2;
        popup.style.zIndex = String(popupZIndex);
      }
    });

    popup.addEventListener('click', (event) => {
      if (event.target === popup) {
        closePopup(popup);
        if (onClose) onClose(popup.id);
      }
    });
  });
}
