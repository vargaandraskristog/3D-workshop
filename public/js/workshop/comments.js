export function createCommentsController({ commentsList, commentForm, commentInput, api, showToast }) {
  let activeObjectId = null;

  function renderComments(comments) {
    commentsList.innerHTML = '';

    if (!comments.length) {
      commentsList.innerHTML = '<p class="muted">No comments yet. Be the first to comment.</p>';
      return;
    }

    comments.forEach((comment) => {
      const item = document.createElement('article');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-meta">
          <strong>${comment.author_name}</strong> (${comment.author_role}) - ${new Date(comment.created_at).toLocaleString()}
        </div>
        <div>${comment.content}</div>
      `;
      commentsList.appendChild(item);
    });
  }

  async function loadComments(objectId) {
    activeObjectId = objectId;
    const data = await api(`/api/objects/${objectId}/comments`, { method: 'GET' });
    renderComments(data.comments || []);
  }

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeObjectId) return;

    const content = String(commentInput.value || '').trim();
    if (!content) return;

    try {
      await api(`/api/objects/${activeObjectId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      commentInput.value = '';
      await loadComments(activeObjectId);
      showToast('Comment posted.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  function clear() {
    activeObjectId = null;
    commentsList.innerHTML = '';
  }

  return {
    loadComments,
    clear,
  };
}
