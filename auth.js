/* auth.js — username/password auth with salted SHA-256 hashing (browser SubtleCrypto). */

const SESSION_KEY = 'moneyapp_session';

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSalt() {
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const Auth = {
  currentUser: null,

  async createUser(username, password) {
    username = username.trim();
    if (!username || !password) throw new Error('Please fill in both fields.');
    const users = await DB.getAll('users');
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('That username is already taken.');
    }
    const salt = randomSalt();
    const passwordHash = await sha256Hex(salt + password);
    const user = {
      id: uid('user'),
      username,
      passwordHash,
      salt,
      createdAt: Date.now(),
      settings: { defaultCurrency: 'USD', theme: 'light' },
    };
    await DB.put('users', user);
    await seedDefaultsForUser(user.id);
    return user;
  },

  async login(username, password) {
    const users = await DB.getAll('users');
    const user = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user) throw new Error('No account with that username.');
    const hash = await sha256Hex(user.salt + password);
    if (hash !== user.passwordHash) throw new Error('Wrong password.');
    this.currentUser = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id }));
    return user;
  },

  async restoreSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const { userId } = JSON.parse(raw);
      const user = await DB.get('users', userId);
      if (user) this.currentUser = user;
      return user;
    } catch (e) {
      return null;
    }
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem(SESSION_KEY);
  },

  async saveUser(user) {
    await DB.put('users', user);
    this.currentUser = user;
  },
};

/* Give every new user a starter set of groups and currencies so the app isn't empty. */
async function seedDefaultsForUser(userId) {
  const incomeGroups = [
    { name: 'Salary', icon: '💼', color: '#0F9D78' },
    { name: 'Gift', icon: '🎁', color: '#3AA6FF' },
    { name: 'Other Income', icon: '➕', color: '#8C6FE6' },
  ];
  const expenseGroups = [
    { name: 'Food', icon: '🍽️', color: '#FF6B5B' },
    { name: 'Transport', icon: '🚌', color: '#F5A623' },
    { name: 'Bills', icon: '🧾', color: '#5B6BFF' },
    { name: 'Shopping', icon: '🛍️', color: '#E667C4' },
    { name: 'Health', icon: '💊', color: '#22B8A6' },
    { name: 'Other', icon: '📦', color: '#8C99A6' },
  ];
  for (const g of incomeGroups) {
    await DB.put('groups', { id: uid('grp'), userId, type: 'income', ...g });
  }
  for (const g of expenseGroups) {
    await DB.put('groups', { id: uid('grp'), userId, type: 'expense', ...g });
  }
  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1, isDefault: true },
    { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92 },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 83.3 },
  ];
  for (const c of currencies) {
    await DB.put('currencies', { id: uid('cur'), userId, ...c });
  }
}
