# Drama Shorts API

Backend API for managing drama shorts series with MongoDB, Express.js, and JWT Authentication.

## Project Structure

```
dramashorts/
├── controllers/
│   ├── authController.js
│   └── seriesController.js
├── middleware/
│   └── auth.js
├── models/
│   ├── Series.js
│   └── User.js
├── routes/
│   ├── authRoutes.js
│   └── seriesRoutes.js
├── server.js
├── package.json
└── .env
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```env
MONGODB_URI=mongodb://localhost:27017/shorts_video
PORT=3000
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=30d
```

3. Make sure MongoDB is running on `mongodb://localhost:27017`

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Authentication Endpoints

#### 1. Register User (POST)
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "user" // optional, defaults to "user"
}
```

#### 2. Login User (POST)
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

Response includes JWT token:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "...",
      "username": "john_doe",
      "email": "john@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 3. Get Current User (GET) - Protected
```
GET /api/auth/me
Authorization: Bearer <token>
```

### Series Endpoints

#### 1. Get All Series (GET) - Public
```
GET /api/series?page=1&limit=10&search=keyword&category=Romance
```

Query Parameters:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search in title and description
- `category` (optional): Filter by category name

#### 2. Get Single Series (GET) - Public
```
GET /api/series/:id
```

#### 3. Create Series (POST) - Protected
```
POST /api/series
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "20 Years Younger, 100% Hotter",
  "description": "After discovering her husband's affair...",
  "totalEpisode": 28,
  "freeEpisode": 8,
  "free": false,
  "category": ["Asian", "Romance", "CEO/Billionaire", "Drama"]
}
```

#### 4. Update Series (PUT) - Protected
```
PUT /api/series/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "free": true
}
```

#### 5. Delete Series (DELETE) - Protected
```
DELETE /api/series/:id
Authorization: Bearer <token>
```

## Authentication

Protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

To use protected endpoints:
1. Register or login to get a token
2. Include the token in the Authorization header for protected routes

## Response Format

All responses follow this format:
```json
{
  "success": true/false,
  "message": "Response message",
  "data": {...}
}
```

## Error Handling

- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: User doesn't have required role
- `404 Not Found`: Resource not found
- `400 Bad Request`: Invalid input data
- `500 Internal Server Error`: Server error

