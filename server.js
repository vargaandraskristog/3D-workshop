const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const app = express();

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const usersDb = new sqlite3.Database(path.join(dataDir, 'users.db'));
const objectsDb = new sqlite3.Database(path.join(dataDir, 'objects.db'));

const runAsync = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const getAsync = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const allAsync = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

async function ensureUserRoleColumn() {
  const columns = await allAsync(usersDb, 'PRAGMA table_info(users)');
  const hasRole = columns.some((col) => col.name === 'role');
  if (!hasRole) {
    await runAsync(usersDb, "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
  await runAsync(usersDb, "UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''");
}

async function ensureBuiltInUsers() {
  const defaultUser = await getAsync(usersDb, 'SELECT id FROM users WHERE username = ?', ['user']);
  if (!defaultUser) {
    const userHash = await bcrypt.hash('password', 10);
    await runAsync(usersDb, 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
      'user',
      userHash,
      'user',
    ]);
  } else {
    await runAsync(usersDb, "UPDATE users SET role = 'user' WHERE username = 'user'");
  }

  const adminUser = await getAsync(usersDb, 'SELECT id FROM users WHERE username = ?', ['admin']);
  if (!adminUser) {
    const adminHash = await bcrypt.hash('password', 10);
    await runAsync(usersDb, 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
      'admin',
      adminHash,
      'admin',
    ]);
  } else {
    await runAsync(usersDb, "UPDATE users SET role = 'admin' WHERE username = 'admin'");
  }
}

async function initDbs() {
  await runAsync(
    usersDb,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await ensureUserRoleColumn();

  await runAsync(
    objectsDb,
    `CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      uploader_id INTEGER NOT NULL,
      uploader_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await runAsync(
    objectsDb,
    `CREATE TABLE IF NOT EXISTS object_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await ensureBuiltInUsers();
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'workshop-demo-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeOriginal}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.fbx') {
      return cb(new Error('Only FBX files are allowed.'));
    }
    return cb(null, true);
  },
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Username must be at least 3 characters and password at least 4.' });
    }

    const cleanUsername = username.trim();
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await runAsync(
      usersDb,
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [cleanUsername, passwordHash, 'user']
    );

    req.session.user = { id: result.lastID, username: cleanUsername, role: 'user' };
    return res.json({ user: req.session.user });
  } catch (error) {
    if (error?.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    return res.status(500).json({ error: 'Failed to register user.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = username.trim();
    const user = await getAsync(
      usersDb,
      'SELECT id, username, password_hash, role FROM users WHERE username = ?',
      [cleanUsername]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role || 'user' };
    return res.json({ user: req.session.user });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to log in.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get('/api/objects', requireAuth, async (_req, res) => {
  try {
    const rows = await allAsync(
      objectsDb,
      `SELECT id, name, description, filename, original_name, uploader_id, uploader_name, created_at
       FROM objects
       ORDER BY datetime(created_at) DESC`
    );

    const result = rows.map((row) => ({
      ...row,
      fileUrl: `/uploads/${row.filename}`,
      downloadUrl: `/api/objects/${row.id}/download`,
    }));

    return res.json({ objects: result });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load objects.' });
  }
});

app.post('/api/objects', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }

    try {
      const { name, description } = req.body;
      if (!name || !req.file) {
        return res.status(400).json({ error: 'Object name and FBX file are required.' });
      }

      const result = await runAsync(
        objectsDb,
        `INSERT INTO objects (name, description, filename, original_name, uploader_id, uploader_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          name.trim(),
          description ? description.trim() : '',
          req.file.filename,
          req.file.originalname,
          req.session.user.id,
          req.session.user.username,
        ]
      );

      return res.json({ id: result.lastID });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to save object.' });
    }
  });
});

app.get('/api/my-objects', requireAuth, async (req, res) => {
  try {
    const sessionUserId = Number.parseInt(req.session.user.id, 10);
    const rows = await allAsync(
      objectsDb,
      `SELECT id, name, description, filename, original_name, uploader_id, uploader_name, created_at
       FROM objects
       WHERE uploader_id = ?
       ORDER BY datetime(created_at) DESC`,
      [sessionUserId]
    );

    const result = rows.map((row) => ({
      ...row,
      fileUrl: `/uploads/${row.filename}`,
      downloadUrl: `/api/objects/${row.id}/download`,
    }));

    return res.json({ objects: result });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load your submissions.' });
  }
});

app.put('/api/my-objects/:id', requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const sessionUserId = Number.parseInt(req.session.user.id, 10);
    const { name, description } = req.body;
    const cleanName = String(name || '').trim();

    if (!cleanName) {
      return res.status(400).json({ error: 'Object name is required.' });
    }

    const existing = await getAsync(objectsDb, 'SELECT id, uploader_id FROM objects WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Object not found.' });
    }
    if (Number.parseInt(existing.uploader_id, 10) !== sessionUserId) {
      return res.status(403).json({ error: 'You can only edit your own submissions.' });
    }

    await runAsync(objectsDb, 'UPDATE objects SET name = ?, description = ? WHERE id = ?', [
      cleanName,
      description ? String(description).trim() : '',
      id,
    ]);

    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update submission.' });
  }
});

app.delete('/api/my-objects/:id', requireAuth, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const sessionUserId = Number.parseInt(req.session.user.id, 10);
    const row = await getAsync(objectsDb, 'SELECT id, uploader_id, filename FROM objects WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ error: 'Object not found.' });
    }
    if (Number.parseInt(row.uploader_id, 10) !== sessionUserId) {
      return res.status(403).json({ error: 'You can only delete your own submissions.' });
    }

    await runAsync(objectsDb, 'DELETE FROM object_comments WHERE object_id = ?', [id]);
    await runAsync(objectsDb, 'DELETE FROM objects WHERE id = ?', [id]);

    const filePath = path.join(uploadsDir, row.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete submission.' });
  }
});

app.get('/api/objects/:id/download', requireAuth, async (req, res) => {
  try {
    const row = await getAsync(objectsDb, 'SELECT filename, original_name FROM objects WHERE id = ?', [req.params.id]);

    if (!row) {
      return res.status(404).json({ error: 'Object not found.' });
    }

    const filePath = path.join(uploadsDir, row.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File missing on server.' });
    }

    return res.download(filePath, row.original_name);
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to download file.' });
  }
});

app.get('/api/objects/:id/comments', requireAuth, async (req, res) => {
  try {
    const objectId = Number.parseInt(req.params.id, 10);
    const objectExists = await getAsync(objectsDb, 'SELECT id FROM objects WHERE id = ?', [objectId]);
    if (!objectExists) {
      return res.status(404).json({ error: 'Object not found.' });
    }

    const comments = await allAsync(
      objectsDb,
      `SELECT id, object_id, author_id, author_name, author_role, content, created_at
       FROM object_comments
       WHERE object_id = ?
       ORDER BY datetime(created_at) ASC`,
      [objectId]
    );

    return res.json({ comments });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load comments.' });
  }
});

app.post('/api/objects/:id/comments', requireAuth, async (req, res) => {
  try {
    const objectId = Number.parseInt(req.params.id, 10);
    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ error: 'Comment content is required.' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: 'Comment is too long (max 500 chars).' });
    }

    const objectExists = await getAsync(objectsDb, 'SELECT id FROM objects WHERE id = ?', [objectId]);
    if (!objectExists) {
      return res.status(404).json({ error: 'Object not found.' });
    }

    const role = req.session.user.role === 'admin' ? 'admin' : 'user';
    const result = await runAsync(
      objectsDb,
      `INSERT INTO object_comments (object_id, author_id, author_name, author_role, content)
       VALUES (?, ?, ?, ?, ?)`,
      [objectId, req.session.user.id, req.session.user.username, role, content]
    );

    return res.json({ id: result.lastID });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save comment.' });
  }
});

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  try {
    const users = await allAsync(
      usersDb,
      'SELECT id, username, role, created_at FROM users ORDER BY datetime(created_at) DESC'
    );
    return res.json({ users });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load users.' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const cleanUsername = (username || '').trim();
    const cleanPassword = String(password || '');
    const cleanRole = role === 'admin' ? 'admin' : 'user';

    if (!cleanUsername || cleanPassword.length < 4) {
      return res.status(400).json({ error: 'Username and password (min 4 chars) are required.' });
    }

    const hash = await bcrypt.hash(cleanPassword, 10);
    const result = await runAsync(
      usersDb,
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [cleanUsername, hash, cleanRole]
    );

    return res.json({ id: result.lastID });
  } catch (error) {
    if (error?.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create user.' });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { username, role, password } = req.body;
    const cleanUsername = (username || '').trim();
    const cleanRole = role === 'admin' ? 'admin' : 'user';

    if (!cleanUsername) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    const existing = await getAsync(usersDb, 'SELECT id, username, role FROM users WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await runAsync(usersDb, 'UPDATE users SET username = ?, role = ? WHERE id = ?', [cleanUsername, cleanRole, id]);

    if (password && String(password).trim().length >= 4) {
      const hash = await bcrypt.hash(String(password), 10);
      await runAsync(usersDb, 'UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
    }

    await runAsync(objectsDb, 'UPDATE objects SET uploader_name = ? WHERE uploader_id = ?', [cleanUsername, id]);

    if (req.session.user.id === id) {
      req.session.user.username = cleanUsername;
      req.session.user.role = cleanRole;
    }

    return res.json({ ok: true });
  } catch (error) {
    if (error?.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    return res.status(500).json({ error: 'Failed to update user.' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (req.session.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own active admin account.' });
    }

    const user = await getAsync(usersDb, 'SELECT id, role FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.role === 'admin') {
      const adminCount = await getAsync(usersDb, "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if ((adminCount?.count || 0) <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin.' });
      }
    }

    // Remove all comments authored by this user (on any object).
    await runAsync(objectsDb, 'DELETE FROM object_comments WHERE author_id = ?', [id]);

    // Remove this user's submissions and related comments/files.
    const userObjects = await allAsync(objectsDb, 'SELECT id, filename FROM objects WHERE uploader_id = ?', [id]);
    for (const objectRow of userObjects) {
      await runAsync(objectsDb, 'DELETE FROM object_comments WHERE object_id = ?', [objectRow.id]);

      const filePath = path.join(uploadsDir, objectRow.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    await runAsync(objectsDb, 'DELETE FROM objects WHERE uploader_id = ?', [id]);

    await runAsync(usersDb, 'DELETE FROM users WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

app.get('/api/admin/objects', requireAdmin, async (_req, res) => {
  try {
    const objects = await allAsync(
      objectsDb,
      `SELECT id, name, description, filename, original_name, uploader_id, uploader_name, created_at
       FROM objects
       ORDER BY datetime(created_at) DESC`
    );

    return res.json({ objects });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to load objects.' });
  }
});

app.post('/api/admin/objects', requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed.' });
    }

    try {
      const { name, description, uploader_id } = req.body;
      if (!name || !req.file) {
        return res.status(400).json({ error: 'Object name and FBX file are required.' });
      }

      let uploader = req.session.user;
      if (uploader_id) {
        const userFromDb = await getAsync(usersDb, 'SELECT id, username FROM users WHERE id = ?', [
          Number.parseInt(uploader_id, 10),
        ]);
        if (userFromDb) {
          uploader = { id: userFromDb.id, username: userFromDb.username };
        }
      }

      const result = await runAsync(
        objectsDb,
        `INSERT INTO objects (name, description, filename, original_name, uploader_id, uploader_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          String(name).trim(),
          description ? String(description).trim() : '',
          req.file.filename,
          req.file.originalname,
          uploader.id,
          uploader.username,
        ]
      );

      return res.json({ id: result.lastID });
    } catch (_error) {
      return res.status(500).json({ error: 'Failed to create object.' });
    }
  });
});

app.put('/api/admin/objects/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { name, description, uploader_name } = req.body;

    const existing = await getAsync(objectsDb, 'SELECT id FROM objects WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Object not found.' });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Object name is required.' });
    }

    await runAsync(
      objectsDb,
      'UPDATE objects SET name = ?, description = ?, uploader_name = ? WHERE id = ?',
      [
        String(name).trim(),
        description ? String(description).trim() : '',
        uploader_name ? String(uploader_name).trim() : 'unknown',
        id,
      ]
    );

    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update object.' });
  }
});

app.delete('/api/admin/objects/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const row = await getAsync(objectsDb, 'SELECT filename FROM objects WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ error: 'Object not found.' });
    }

    await runAsync(objectsDb, 'DELETE FROM object_comments WHERE object_id = ?', [id]);
    await runAsync(objectsDb, 'DELETE FROM objects WHERE id = ?', [id]);

    const filePath = path.join(uploadsDir, row.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete object.' });
  }
});

app.get('/admin', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).send('Admin access required.');
  }
  return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/{*any}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDbs()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Workshop app running on http://localhost:${PORT}`);
      console.log('Default users: user/password and admin/password');
    });
  })
  .catch((error) => {
    console.error('Failed to initialize databases:', error);
    process.exit(1);
  });
