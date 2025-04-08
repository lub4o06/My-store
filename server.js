const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const result = dotenv.config();

if (result.error) {
  console.error('Error loading .env file:', result.error);
}

console.log('Environment variables loaded:', {
  jwt_secret_exists: !!process.env.JWT_SECRET,
  env_path: result.parsed ? 'Found' : 'Not found',
  current_dir: __dirname
});

const app = express();
const port = 3000;

// Middleware за обработка на JSON данни
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'pages')));
app.use(express.static(path.join(__dirname, 'public')));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Свързване към MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1325679',
  database: 'pc_store',
});

// Тестване на връзката с базата данни
db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the database!');
});

// Test route to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Serve login page for both root and /login paths
app.get(['/', '/login'], (req, res) => {
  

  res.sendFile(path.join(__dirname, 'pages', 'login.html'));

});

// Registration route
app.post('/api/register', async (req, res) => {
  try {
    console.log('Register request received:', req.body);
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user already exists
    const [existingUsers] = await db.promise().query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const [result] = await db.promise().query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: result.insertId,
        username: name,
        email: email
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Error during registration', 
      error: error.message 
    });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  console.log('Login attempt:', req.body);
  try {
    const { email, password } = req.body;

    // Check if JWT_SECRET exists
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined in environment variables');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    // Get user from database
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    // More detailed error logging
    console.error('Login error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'dashboard.html'));
});

// Products API route
app.get('/api/products/:category', async (req, res) => {
    try {
        const category = req.params.category;
        let query;
        
        if (category === 'best-sellers') {
            query = `
                SELECT 'CPU' as type, id, name, price, stock, description, best_seller, image_url 
                FROM cpus WHERE best_seller = 1
                UNION ALL
                SELECT 'GPU' as type, id, name, price, stock, description, best_seller, image_url 
                FROM gpus WHERE best_seller = 1
                UNION ALL
                SELECT 'RAM' as type, id, name, price, stock, description, best_seller, image_url 
                FROM ram WHERE best_seller = 1
                UNION ALL
                SELECT 'Motherboard' as type, id, name, price, stock, description, best_seller, image_url 
                FROM motherboards WHERE best_seller = 1
            `;
        } else if (category === 'all') {
            query = `
                SELECT 'CPU' as type, id, name, price, stock, description, best_seller, image_url FROM cpus
                UNION ALL
                SELECT 'GPU' as type, id, name, price, stock, description, best_seller, image_url FROM gpus
                UNION ALL
                SELECT 'RAM' as type, id, name, price, stock, description, best_seller, image_url FROM ram
                UNION ALL
                SELECT 'Motherboard' as type, id, name, price, stock, description, best_seller, image_url FROM motherboards
            `;
        } else {
            const tables = {
                cpu: 'cpus',
                gpu: 'gpus',
                ram: 'ram',
                motherboard: 'motherboards'
            };
            const table = tables[category];
            if (!table) {
                return res.status(400).json({ message: 'Invalid category' });
            }
            query = `SELECT *, '${category}' as type FROM ${table}`;
        }

        const [products] = await db.promise().query(query);
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Error fetching products' });
    }
});

// Products page route
app.get('/products', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'products.html'));
});

// Product details page route
app.get('/product-details', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'product-details.html'));
});

// Single product API route
app.get('/api/product/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const tables = {
            cpu: 'cpus',
            gpu: 'gpus',
            ram: 'ram',
            motherboard: 'motherboards'
        };

        const table = tables[type.toLowerCase()];
        if (!table) {
            return res.status(400).json({ message: 'Invalid product type' });
        }

        const [products] = await db.promise().query(
            `SELECT *, '${type}' as type FROM ${table} WHERE id = ?`,
            [id]
        );

        if (products.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json(products[0]);
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).json({ message: 'Error fetching product details' });
    }
});

// Get comments for a product
app.get('/api/comments/:type/:productId', async (req, res) => {
    try {
        const { type, productId } = req.params;
        const columnName = `${type.toLowerCase()}_id`;
        
        const [comments] = await db.promise().query(
            `SELECT comments.*, users.username 
             FROM comments 
             JOIN users ON comments.user_id = users.id 
             WHERE ${columnName} = ?
             ORDER BY comments.created_at DESC`,
            [productId]
        );
        
        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Error fetching comments' });
    }
});

// Post a new comment
app.post('/api/comments', async (req, res) => {
    try {
        // Get user ID from token
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('Decoded token:', decoded); // Debug log
        } catch (err) {
            console.error('Token verification error:', err);
            return res.status(401).json({ message: 'Invalid token' });
        }

        const userId = decoded.userId;
        const { productId, productType, comment } = req.body;

        // Log the values for debugging
        console.log('Comment values:', { userId, productId, productType, comment });

        if (!userId || !productId || !productType || !comment) {
            return res.status(400).json({ 
                message: 'Missing required fields',
                received: { userId, productId, productType, comment }
            });
        }

        // Map product type to correct column name
        const columnMapping = {
            cpu: 'cpu_id',
            gpu: 'gpu_id',
            ram: 'ram_id',
            motherboard: 'motherboard_id'
        };

        const columnName = columnMapping[productType.toLowerCase()];
        if (!columnName) {
            return res.status(400).json({ 
                message: 'Invalid product type',
                received: productType
            });
        }

        // Build the query
        const query = `
            INSERT INTO comments (user_id, ${columnName}, comment)
            VALUES (?, ?, ?)
        `;

        const values = [userId, productId, comment];

        // Log the query and values
        console.log('Query:', query);
        console.log('Values:', values);

        const [result] = await db.promise().query(query, values);

        if (result.affectedRows === 1) {
            const [newComment] = await db.promise().query(
                `SELECT comments.*, users.username 
                 FROM comments 
                 JOIN users ON comments.user_id = users.id 
                 WHERE comments.id = ?`,
                [result.insertId]
            );

            return res.status(201).json(newComment[0]);
        } else {
            return res.status(400).json({ message: 'Error creating comment' });
        }
    } catch (error) {
        console.error('Error in /api/comments:', error);
        return res.status(500).json({ 
            message: 'Error posting comment',
            error: error.message
        });
    }
});

// Check if user is admin endpoint
app.get('/api/user/is-admin', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ isAdmin: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const [users] = await db.promise().query(
            'SELECT is_admin FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ isAdmin: false, message: 'User not found' });
        }

        return res.json({ isAdmin: !!users[0].is_admin });
    } catch (error) {
        console.error('Error checking admin status:', error);
        return res.status(500).json({ isAdmin: false, message: 'Error checking admin status' });
    }
});

// Delete comment endpoint
app.delete('/api/comments/:commentId', async (req, res) => {
    try {
        const { commentId } = req.params;
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Check if user is admin
        const [users] = await db.promise().query(
            'SELECT is_admin FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0 || !users[0].is_admin) {
            return res.status(403).json({ message: 'Not authorized to delete comments' });
        }

        // Delete the comment
        const [result] = await db.promise().query(
            'DELETE FROM comments WHERE id = ?',
            [commentId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        return res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        return res.status(500).json({ message: 'Error deleting comment' });
    }
});

// Add this route after your other page routes
app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'about.html'));
});

// Стартиране на сървъра
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

