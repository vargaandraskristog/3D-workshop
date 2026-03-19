import { api } from '../common/api.js';
import { createToast } from '../common/toast.js';
import { initThemeToggle } from '../common/theme.js';
import { openPopup, closePopup, attachPopupCloseHandlers } from '../common/popup.js';

export function initAdminPage() {
  const usersBody = document.getElementById('usersBody');
  const objectsBody = document.getElementById('objectsBody');
  const refreshUsersBtn = document.getElementById('refreshUsersBtn');
  const refreshObjectsBtn = document.getElementById('refreshObjectsBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const themeToggle = document.getElementById('themeToggle');
  const adminUserName = document.getElementById('adminUserName');
  const adminUserRole = document.getElementById('adminUserRole');

  const openUsersDbBtn = document.getElementById('openUsersDbBtn');
  const openUsersDbBtn2 = document.getElementById('openUsersDbBtn2');
  const openObjectsDbBtn = document.getElementById('openObjectsDbBtn');
  const openObjectsDbBtn2 = document.getElementById('openObjectsDbBtn2');
  const usersPopup = document.getElementById('usersPopup');
  const objectsPopup = document.getElementById('objectsPopup');

  const createUserForm = document.getElementById('createUserForm');
  const createObjectForm = document.getElementById('createObjectForm');
  const createObjectUploader = document.getElementById('createObjectUploader');

  const showToast = createToast(document.getElementById('toastContainer'));
  initThemeToggle(themeToggle);

  let usersCache = [];

  function fillUploaderSelect(users) {
    const previous = createObjectUploader.value;
    createObjectUploader.innerHTML = '';

    users.forEach((u) => {
      const option = document.createElement('option');
      option.value = String(u.id);
      option.textContent = `${u.username} (${u.role})`;
      createObjectUploader.appendChild(option);
    });

    if (previous) {
      createObjectUploader.value = previous;
    }

    if (!createObjectUploader.value) {
      const admin = users.find((u) => u.role === 'admin' && u.username === 'admin') || users.find((u) => u.role === 'admin');
      if (admin) {
        createObjectUploader.value = String(admin.id);
      }
    }
  }

  function renderUsers(users) {
    usersBody.innerHTML = '';

    users.forEach((user) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${user.id}</td>
        <td><input data-field="username" value="${user.username}" /></td>
        <td>
          <select data-field="role">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>user</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </td>
        <td><input data-field="password" type="password" placeholder="Leave blank" /></td>
        <td>${new Date(user.created_at).toLocaleString()}</td>
        <td>
          <div class="admin-actions">
            <button class="btn" data-action="save">Save</button>
            <button class="btn btn-danger" data-action="delete">Delete</button>
          </div>
        </td>
      `;

      tr.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const username = tr.querySelector('[data-field="username"]').value;
        const role = tr.querySelector('[data-field="role"]').value;
        const password = tr.querySelector('[data-field="password"]').value;

        try {
          await api(`/api/admin/users/${user.id}`, {
            method: 'PUT',
            body: JSON.stringify({ username, role, password }),
          });
          await loadUsers();
          await loadObjects();
          showToast('User updated.');
        } catch (error) {
          showToast(error.message, true);
        }
      });

      tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const ok = window.confirm(`Delete user ${user.username}?`);
        if (!ok) return;

        try {
          await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
          await loadUsers();
          await loadObjects();
          showToast('User deleted.');
        } catch (error) {
          showToast(error.message, true);
        }
      });

      usersBody.appendChild(tr);
    });
  }

  function renderObjects(objects) {
    objectsBody.innerHTML = '';

    objects.forEach((obj) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${obj.id}</td>
        <td><input data-field="name" value="${obj.name}" /></td>
        <td><input data-field="description" value="${obj.description || ''}" /></td>
        <td><input data-field="uploader_name" value="${obj.uploader_name}" /></td>
        <td>${obj.original_name}</td>
        <td>
          <div class="admin-actions">
            <button class="btn" data-action="save">Save</button>
            <button class="btn btn-danger" data-action="delete">Delete</button>
          </div>
        </td>
      `;

      tr.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const name = tr.querySelector('[data-field="name"]').value;
        const description = tr.querySelector('[data-field="description"]').value;
        const uploader_name = tr.querySelector('[data-field="uploader_name"]').value;

        try {
          await api(`/api/admin/objects/${obj.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description, uploader_name }),
          });
          await loadObjects();
          showToast('Object updated.');
        } catch (error) {
          showToast(error.message, true);
        }
      });

      tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const ok = window.confirm(`Delete object ${obj.name}?`);
        if (!ok) return;

        try {
          await api(`/api/admin/objects/${obj.id}`, { method: 'DELETE' });
          await loadObjects();
          showToast('Object deleted.');
        } catch (error) {
          showToast(error.message, true);
        }
      });

      objectsBody.appendChild(tr);
    });
  }

  async function loadUsers() {
    const data = await api('/api/admin/users', { method: 'GET' });
    usersCache = data.users || [];
    renderUsers(usersCache);
    fillUploaderSelect(usersCache);
  }

  async function loadObjects() {
    const data = await api('/api/admin/objects', { method: 'GET' });
    renderObjects(data.objects || []);
  }

  async function ensureAdminSession() {
    const data = await api('/api/me', { method: 'GET' });
    if (!data.user) {
      window.location.href = '/';
      return false;
    }

    if (data.user.role !== 'admin') {
      showToast('Admin access required.', true);
      setTimeout(() => {
        window.location.href = '/';
      }, 900);
      return false;
    }

    adminUserName.textContent = data.user.username;
    adminUserRole.textContent = data.user.role;
    return true;
  }

  openUsersDbBtn.addEventListener('click', async () => {
    openPopup(usersPopup);
    await loadUsers();
  });

  openUsersDbBtn2.addEventListener('click', async () => {
    openPopup(usersPopup);
    await loadUsers();
  });

  openObjectsDbBtn.addEventListener('click', async () => {
    openPopup(objectsPopup);
    await loadUsers();
    await loadObjects();
  });

  openObjectsDbBtn2.addEventListener('click', async () => {
    openPopup(objectsPopup);
    await loadUsers();
    await loadObjects();
  });

  document.querySelectorAll('.close-popup').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      closePopup(document.getElementById(id));
    });
  });

  attachPopupCloseHandlers([usersPopup, objectsPopup]);

  createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(createUserForm);

    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
          role: formData.get('role'),
        }),
      });

      createUserForm.reset();
      await loadUsers();
      showToast('User created.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  createObjectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(createObjectForm);

    try {
      await api('/api/admin/objects', {
        method: 'POST',
        body: formData,
      });

      createObjectForm.reset();
      fillUploaderSelect(usersCache);
      await loadObjects();
      showToast('Object entry created.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  refreshUsersBtn.addEventListener('click', async () => {
    try {
      await loadUsers();
      showToast('Users refreshed.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  refreshObjectsBtn.addEventListener('click', async () => {
    try {
      await loadObjects();
      showToast('Objects refreshed.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (_error) {
      // Ignore and redirect anyway.
    }
    window.location.href = '/';
  });

  (async () => {
    try {
      const ok = await ensureAdminSession();
      if (!ok) return;
      await loadUsers();
      await loadObjects();
    } catch (error) {
      showToast(error.message, true);
    }
  })();
}
