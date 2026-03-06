const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const INSTRUCTORS_FILE = path.join(DATA_DIR, 'instructors.json');
const SHIFTS_FILE = path.join(DATA_DIR, 'shifts.json');
const SUBJECTS_FILE = path.join(DATA_DIR, 'subjects.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(INSTRUCTORS_FILE)) fs.writeFileSync(INSTRUCTORS_FILE, '[]');
if (!fs.existsSync(SHIFTS_FILE)) fs.writeFileSync(SHIFTS_FILE, '[]');
if (!fs.existsSync(SUBJECTS_FILE)) fs.writeFileSync(SUBJECTS_FILE, '[]');
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, '[]');
if (!fs.existsSync(CUSTOMERS_FILE)) fs.writeFileSync(CUSTOMERS_FILE, '[]');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Instructors
app.get('/api/instructors', (req, res) => {
  res.json(readJSON(INSTRUCTORS_FILE));
});

app.post('/api/instructors', (req, res) => {
  const instructors = readJSON(INSTRUCTORS_FILE);
  const instructor = { id: uuidv4(), ...req.body };
  instructors.push(instructor);
  writeJSON(INSTRUCTORS_FILE, instructors);
  res.json(instructor);
});

app.put('/api/instructors/:id', (req, res) => {
  const instructors = readJSON(INSTRUCTORS_FILE);
  const idx = instructors.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  instructors[idx] = { ...instructors[idx], ...req.body };
  writeJSON(INSTRUCTORS_FILE, instructors);
  res.json(instructors[idx]);
});

app.delete('/api/instructors/:id', (req, res) => {
  let instructors = readJSON(INSTRUCTORS_FILE);
  instructors = instructors.filter(i => i.id !== req.params.id);
  writeJSON(INSTRUCTORS_FILE, instructors);
  // Also delete associated shifts
  let shifts = readJSON(SHIFTS_FILE);
  shifts = shifts.filter(s => s.instructorId !== req.params.id);
  writeJSON(SHIFTS_FILE, shifts);
  res.json({ success: true });
});

// Shifts
app.get('/api/shifts', (req, res) => {
  res.json(readJSON(SHIFTS_FILE));
});

app.post('/api/shifts', (req, res) => {
  const shifts = readJSON(SHIFTS_FILE);
  const shift = { id: uuidv4(), ...req.body };
  shifts.push(shift);
  writeJSON(SHIFTS_FILE, shifts);
  res.json(shift);
});

app.put('/api/shifts/:id', (req, res) => {
  const shifts = readJSON(SHIFTS_FILE);
  const idx = shifts.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  shifts[idx] = { ...shifts[idx], ...req.body };
  writeJSON(SHIFTS_FILE, shifts);
  res.json(shifts[idx]);
});

app.delete('/api/shifts/:id', (req, res) => {
  let shifts = readJSON(SHIFTS_FILE);
  shifts = shifts.filter(s => s.id !== req.params.id);
  writeJSON(SHIFTS_FILE, shifts);
  res.json({ success: true });
});

// Subjects
app.get('/api/subjects', (req, res) => {
  res.json(readJSON(SUBJECTS_FILE));
});

app.post('/api/subjects', (req, res) => {
  const subjects = readJSON(SUBJECTS_FILE);
  const subject = { id: uuidv4(), ...req.body };
  subjects.push(subject);
  writeJSON(SUBJECTS_FILE, subjects);
  res.json(subject);
});

app.put('/api/subjects/:id', (req, res) => {
  const subjects = readJSON(SUBJECTS_FILE);
  const idx = subjects.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  subjects[idx] = { ...subjects[idx], ...req.body };
  writeJSON(SUBJECTS_FILE, subjects);
  res.json(subjects[idx]);
});

app.delete('/api/subjects/:id', (req, res) => {
  const subjects = readJSON(SUBJECTS_FILE);
  const subject = subjects.find(s => s.id === req.params.id);
  if (!subject) return res.status(404).json({ error: 'Not found' });
  writeJSON(SUBJECTS_FILE, subjects.filter(s => s.id !== req.params.id));
  res.json({ success: true });
});

// Customers
app.get('/api/customers', (req, res) => {
  res.json(readJSON(CUSTOMERS_FILE));
});

app.post('/api/customers', (req, res) => {
  const customers = readJSON(CUSTOMERS_FILE);
  const customer = { id: uuidv4(), ...req.body };
  customers.push(customer);
  writeJSON(CUSTOMERS_FILE, customers);
  res.json(customer);
});

app.put('/api/customers/:id', (req, res) => {
  const customers = readJSON(CUSTOMERS_FILE);
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  customers[idx] = { ...customers[idx], ...req.body };
  writeJSON(CUSTOMERS_FILE, customers);
  res.json(customers[idx]);
});

app.delete('/api/customers/:id', (req, res) => {
  let customers = readJSON(CUSTOMERS_FILE);
  customers = customers.filter(c => c.id !== req.params.id);
  writeJSON(CUSTOMERS_FILE, customers);
  res.json({ success: true });
});

// Bookings
app.get('/api/bookings', (req, res) => {
  res.json(readJSON(BOOKINGS_FILE));
});

app.post('/api/bookings', (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const booking = { id: uuidv4(), ...req.body };
  bookings.push(booking);
  writeJSON(BOOKINGS_FILE, bookings);
  res.json(booking);
});

app.put('/api/bookings/:id', (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  bookings[idx] = { ...bookings[idx], ...req.body };
  writeJSON(BOOKINGS_FILE, bookings);
  res.json(bookings[idx]);
});

app.delete('/api/bookings/:id', (req, res) => {
  let bookings = readJSON(BOOKINGS_FILE);
  bookings = bookings.filter(b => b.id !== req.params.id);
  writeJSON(BOOKINGS_FILE, bookings);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`講師シフト管理システム起動中: http://localhost:${PORT}`);
});
