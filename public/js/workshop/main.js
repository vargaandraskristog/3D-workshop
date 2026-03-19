import { api } from '../common/api.js';
import { createToast } from '../common/toast.js';
import { applyTheme, initThemeToggle } from '../common/theme.js';
import { openPopup, closePopup, attachPopupCloseHandlers } from '../common/popup.js';
import { createPreviewController } from './preview3d.js';
import { createCommentsController } from './comments.js';

export function initWorkshopPage() {
  const authSection = document.getElementById('authSection');
  const workshopSection = document.getElementById('workshopSection');
  const activeUser = document.getElementById('activeUser');
  const objectsGrid = document.getElementById('objectsGrid');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const uploadForm = document.getElementById('uploadForm');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const themeToggle = document.getElementById('themeToggle');
  const authThemeToggle = document.getElementById('authThemeToggle');
  const searchInput = document.getElementById('searchInput');
  const adminLink = document.getElementById('adminLink');

  const openRegisterBtn = document.getElementById('openRegisterBtn');
  const registerPopup = document.getElementById('registerPopup');
  const detailsPopup = document.getElementById('detailsPopup');

  const detailsTitle = document.getElementById('detailsTitle');
  const detailsMeta = document.getElementById('detailsMeta');
  const detailsDescription = document.getElementById('detailsDescription');
  const downloadBtn = document.getElementById('downloadBtn');
  const detailsCanvas = document.getElementById('detailsCanvas');

  const commentsList = document.getElementById('commentsList');
  const commentForm = document.getElementById('commentForm');
  const commentInput = document.getElementById('commentInput');

  const showToast = createToast(document.getElementById('toastContainer'));
  const preview = createPreviewController({ objectsGrid, detailsCanvas, detailsPopup, showToast });
  const comments = createCommentsController({ commentsList, commentForm, commentInput, api, showToast });

  let currentObjects = [];
  let searchTerm = '';

  function setAuthUi(user) {
    if (user) {
      activeUser.textContent = user.username;
      adminLink.classList.toggle('hidden', user.role !== 'admin');
      authSection.classList.add('hidden');
      workshopSection.classList.remove('hidden');
    } else {
      activeUser.textContent = '-';
      adminLink.classList.add('hidden');
      authSection.classList.remove('hidden');
      workshopSection.classList.add('hidden');
      objectsGrid.innerHTML = '';
      preview.cleanupCards();
      preview.cleanupDetails();
      preview.clearActiveItem();
      comments.clear();
      closePopup(detailsPopup);
    }
  }

  function getFilteredObjects() {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return currentObjects;

    return currentObjects.filter((item) => {
      const text = `${item.name} ${item.uploader_name} ${item.description || ''}`.toLowerCase();
      return text.includes(term);
    });
  }

  async function renderObjects() {
    preview.cleanupCards();
    objectsGrid.innerHTML = '';

    const filtered = getFilteredObjects();
    if (!filtered.length) {
      objectsGrid.innerHTML = '<p class="muted">No matching objects.</p>';
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'object-card';
      card.innerHTML = `
        <canvas class="preview-canvas"></canvas>
        <p class="name">${item.name}</p>
        <p class="uploader">${item.uploader_name}</p>
        <button class="btn" type="button">Details</button>
      `;

      card.querySelector('button').addEventListener('click', () => openDetails(item));
      objectsGrid.appendChild(card);
    });

    await preview.renderCardPreviews(filtered);
  }

  async function loadObjects() {
    const data = await api('/api/objects', { method: 'GET' });
    currentObjects = data.objects || [];
    await renderObjects();
  }

  async function openDetails(item) {
    detailsTitle.textContent = item.name;
    detailsMeta.textContent = `Uploaded by ${item.uploader_name} on ${new Date(item.created_at).toLocaleString()}`;
    detailsDescription.textContent = item.description || 'No description provided.';
    downloadBtn.href = item.downloadUrl;

    openPopup(detailsPopup);
    await preview.openDetailsPreview(item);
    await comments.loadComments(item.id);
  }

  async function handleThemeChange() {
    await renderObjects();
    const activeItem = preview.getActiveItem();
    if (activeItem && !detailsPopup.classList.contains('hidden')) {
      await openDetails(activeItem);
    }
  }

  initThemeToggle(authThemeToggle, handleThemeChange);
  themeToggle.addEventListener('click', async () => {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    await handleThemeChange();
  });

  openRegisterBtn.addEventListener('click', () => openPopup(registerPopup));

  searchInput.addEventListener('input', async () => {
    searchTerm = searchInput.value;
    await renderObjects();
  });

  document.querySelectorAll('.close-popup').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      closePopup(document.getElementById(id));
      if (id === 'detailsPopup') {
        preview.cleanupDetails();
        preview.clearActiveItem();
        comments.clear();
      }
    });
  });

  attachPopupCloseHandlers([registerPopup, detailsPopup], (id) => {
    if (id === 'detailsPopup') {
      preview.cleanupDetails();
      preview.clearActiveItem();
      comments.clear();
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
        }),
      });

      loginForm.reset();
      setAuthUi(data.user);
      await loadObjects();
      showToast('Logged in successfully.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);

    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
        }),
      });

      registerForm.reset();
      closePopup(registerPopup);
      setAuthUi(data.user);
      await loadObjects();
      showToast('Registration complete.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(uploadForm);

    try {
      await api('/api/objects', {
        method: 'POST',
        body: formData,
      });

      uploadForm.reset();
      await loadObjects();
      showToast('FBX uploaded.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  refreshBtn.addEventListener('click', async () => {
    try {
      await loadObjects();
      showToast('List refreshed.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (_error) {
      // Keep UI reset even if network has a hiccup.
    }

    preview.cleanupCards();
    preview.cleanupDetails();
    preview.clearActiveItem();
    comments.clear();
    setAuthUi(null);
    showToast('Logged out.');
  });

  window.addEventListener('resize', () => {
    preview.handleResize();
  });

  (async () => {
    try {
      const data = await api('/api/me', { method: 'GET' });
      setAuthUi(data.user);
      if (data.user) {
        await loadObjects();
      }
    } catch (_error) {
      setAuthUi(null);
    }
  })();
}
