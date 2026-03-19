export function openPopup(node) {
  node.classList.remove('hidden');
}

export function closePopup(node) {
  node.classList.add('hidden');
}

export function attachPopupCloseHandlers(popupNodes, onClose) {
  popupNodes.forEach((popup) => {
    popup.addEventListener('click', (event) => {
      if (event.target === popup) {
        closePopup(popup);
        if (onClose) onClose(popup.id);
      }
    });
  });
}
