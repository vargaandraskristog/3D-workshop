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
  const myUploadsGrid = document.getElementById('myUploadsGrid');

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const uploadForm = document.getElementById('uploadForm');
  const editSubmissionForm = document.getElementById('editSubmissionForm');

  const refreshBtn = document.getElementById('refreshBtn');
  const refreshMyUploadsBtn = document.getElementById('refreshMyUploadsBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const themeToggle = document.getElementById('themeToggle');
  const authThemeToggle = document.getElementById('authThemeToggle');
  const searchInput = document.getElementById('searchInput');
  const myUploadsSearchInput = document.getElementById('myUploadsSearchInput');
  const adminLink = document.getElementById('adminLink');

  const openRegisterBtn = document.getElementById('openRegisterBtn');
  const openUploadBtn = document.getElementById('openUploadBtn');
  const openMyUploadsBtn = document.getElementById('openMyUploadsBtn');

  const registerPopup = document.getElementById('registerPopup');
  const detailsPopup = document.getElementById('detailsPopup');
  const uploadPopup = document.getElementById('uploadPopup');
  const myUploadsPopup = document.getElementById('myUploadsPopup');
  const editSubmissionPopup = document.getElementById('editSubmissionPopup');
  const deleteSubmissionPopup = document.getElementById('deleteSubmissionPopup');

  const detailsTitle = document.getElementById('detailsTitle');
  const detailsMeta = document.getElementById('detailsMeta');
  const detailsDescription = document.getElementById('detailsDescription');
  const downloadBtn = document.getElementById('downloadBtn');
  const detailsCanvas = document.getElementById('detailsCanvas');
  const detailsEditBtn = document.getElementById('detailsEditBtn');
  const detailsDeleteBtn = document.getElementById('detailsDeleteBtn');

  const commentsList = document.getElementById('commentsList');
  const commentForm = document.getElementById('commentForm');
  const commentInput = document.getElementById('commentInput');

  const editSubmissionId = document.getElementById('editSubmissionId');
  const editSubmissionName = document.getElementById('editSubmissionName');
  const editSubmissionDescription = document.getElementById('editSubmissionDescription');

  const confirmDeleteSubmissionBtn = document.getElementById('confirmDeleteSubmissionBtn');
  const deleteSubmissionText = document.getElementById('deleteSubmissionText');

  const showToast = createToast(document.getElementById('toastContainer'));

  const mainPreview = createPreviewController({ objectsGrid, detailsCanvas, detailsPopup, showToast });
  const myUploadsPreview = createPreviewController({ objectsGrid: myUploadsGrid, detailsCanvas, detailsPopup, showToast });
  const comments = createCommentsController({ commentsList, commentForm, commentInput, api, showToast });

  let currentUser = null;
  let currentObjects = [];
  let myUploads = [];
  let searchTerm = '';
  let myUploadsSearchTerm = '';
  let activeOwnedSubmission = null;

  function isOwnedByCurrentUser(item) {
    if (!currentUser || !item) return false;
    return Number.parseInt(item.uploader_id, 10) === Number.parseInt(currentUser.id, 10);
  }

  function setAuthUi(user) {
    currentUser = user;
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
      myUploadsGrid.innerHTML = '';
      mainPreview.cleanupCards();
      mainPreview.cleanupDetails();
      mainPreview.clearActiveItem();
      myUploadsPreview.cleanupCards();
      comments.clear();
      activeOwnedSubmission = null;
      closePopup(detailsPopup);
      closePopup(myUploadsPopup);
      closePopup(uploadPopup);
      closePopup(editSubmissionPopup);
      closePopup(deleteSubmissionPopup);
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

  function getFilteredMyUploads() {
    const term = myUploadsSearchTerm.trim().toLowerCase();
    if (!term) return myUploads;

    return myUploads.filter((item) => {
      const text = `${item.name} ${item.description || ''}`.toLowerCase();
      return text.includes(term);
    });
  }

  async function renderMainObjects() {
    mainPreview.cleanupCards();
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

    await mainPreview.renderCardPreviews(filtered);
  }

  async function renderMyUploads() {
    myUploadsPreview.cleanupCards();
    myUploadsGrid.innerHTML = '';

    const filtered = getFilteredMyUploads();
    if (!filtered.length) {
      myUploadsGrid.innerHTML = '<p class="muted">You have not uploaded anything yet.</p>';
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'object-card';
      card.innerHTML = `
        <canvas class="preview-canvas"></canvas>
        <p class="name">${item.name}</p>
        <p class="uploader">${item.uploader_name}</p>
        <button class="btn" data-action="details" type="button">Details</button>
      `;

      card.querySelector('[data-action="details"]').addEventListener('click', () => openDetails(item));
      myUploadsGrid.appendChild(card);
    });

    await myUploadsPreview.renderCardPreviews(filtered);
  }

  async function loadObjects() {
    const data = await api('/api/objects', { method: 'GET' });
    currentObjects = data.objects || [];
    await renderMainObjects();
  }

  async function loadMyUploads() {
    const data = await api('/api/my-objects', { method: 'GET' });
    myUploads = data.objects || [];
    await renderMyUploads();
  }

  async function openDetails(item) {
    detailsTitle.textContent = item.name;
    detailsMeta.textContent = `Uploaded by ${item.uploader_name} on ${new Date(item.created_at).toLocaleString()}`;
    detailsDescription.textContent = item.description || 'No description provided.';
    downloadBtn.href = item.downloadUrl;

    const owned = isOwnedByCurrentUser(item);
    activeOwnedSubmission = owned ? item : null;
    detailsEditBtn.classList.toggle('hidden', !owned);
    detailsDeleteBtn.classList.toggle('hidden', !owned);

    openPopup(detailsPopup);
    await mainPreview.openDetailsPreview(item);
    await comments.loadComments(item.id);
  }

  function openEditSubmission(item) {
    editSubmissionId.value = item.id;
    editSubmissionName.value = item.name;
    editSubmissionDescription.value = item.description || '';
    openPopup(editSubmissionPopup);
  }

  function openDeleteSubmission(item) {
    deleteSubmissionText.textContent = `Are you sure you want to delete submission: ${item.name}?`;
    openPopup(deleteSubmissionPopup);
  }

  async function deleteSubmission(item) {
    try {
      await api(`/api/my-objects/${item.id}`, { method: 'DELETE' });
      await loadMyUploads();
      await loadObjects();
      closePopup(deleteSubmissionPopup);
      closePopup(detailsPopup);
      mainPreview.cleanupDetails();
      mainPreview.clearActiveItem();
      comments.clear();
      activeOwnedSubmission = null;
      showToast('Submission deleted.');
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function handleThemeChange() {
    await renderMainObjects();
    if (!myUploadsPopup.classList.contains('hidden')) {
      await renderMyUploads();
    }
    const activeItem = mainPreview.getActiveItem();
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
  openUploadBtn.addEventListener('click', () => openPopup(uploadPopup));

  openMyUploadsBtn.addEventListener('click', async () => {
    openPopup(myUploadsPopup);
    await loadMyUploads();
  });

  detailsEditBtn.addEventListener('click', () => {
    if (activeOwnedSubmission) {
      openEditSubmission(activeOwnedSubmission);
    }
  });

  detailsDeleteBtn.addEventListener('click', () => {
    if (activeOwnedSubmission) {
      openDeleteSubmission(activeOwnedSubmission);
    }
  });

  confirmDeleteSubmissionBtn.addEventListener('click', async () => {
    if (activeOwnedSubmission) {
      await deleteSubmission(activeOwnedSubmission);
    }
  });

  searchInput.addEventListener('input', async () => {
    searchTerm = searchInput.value;
    await renderMainObjects();
  });

  myUploadsSearchInput.addEventListener('input', async () => {
    myUploadsSearchTerm = myUploadsSearchInput.value;
    await renderMyUploads();
  });

  document.querySelectorAll('.close-popup').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      closePopup(document.getElementById(id));
      if (id === 'detailsPopup') {
        mainPreview.cleanupDetails();
        mainPreview.clearActiveItem();
        comments.clear();
        activeOwnedSubmission = null;
      }
      if (id === 'myUploadsPopup') {
        myUploadsPreview.cleanupCards();
      }
    });
  });

  attachPopupCloseHandlers(
    [registerPopup, detailsPopup, uploadPopup, myUploadsPopup, editSubmissionPopup, deleteSubmissionPopup],
    (id) => {
      if (id === 'detailsPopup') {
        mainPreview.cleanupDetails();
        mainPreview.clearActiveItem();
        comments.clear();
        activeOwnedSubmission = null;
      }
      if (id === 'myUploadsPopup') {
        myUploadsPreview.cleanupCards();
      }
    }
  );

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
      closePopup(uploadPopup);
      await loadObjects();
      if (!myUploadsPopup.classList.contains('hidden')) {
        await loadMyUploads();
      }
      showToast('FBX uploaded. Refreshing view...');
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  editSubmissionForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await api(`/api/my-objects/${editSubmissionId.value}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editSubmissionName.value,
          description: editSubmissionDescription.value,
        }),
      });

      closePopup(editSubmissionPopup);
      await loadMyUploads();
      await loadObjects();

      const updated = myUploads.find((obj) => Number.parseInt(obj.id, 10) === Number.parseInt(editSubmissionId.value, 10));
      if (updated && !detailsPopup.classList.contains('hidden')) {
        await openDetails(updated);
      }

      showToast('Submission updated.');
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

  refreshMyUploadsBtn.addEventListener('click', async () => {
    try {
      await loadMyUploads();
      showToast('My submissions refreshed.');
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

    mainPreview.cleanupCards();
    mainPreview.cleanupDetails();
    mainPreview.clearActiveItem();
    myUploadsPreview.cleanupCards();
    comments.clear();
    activeOwnedSubmission = null;
    setAuthUi(null);
    showToast('Logged out.');
  });

  window.addEventListener('resize', () => {
    mainPreview.handleResize();
    myUploadsPreview.handleResize();
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
