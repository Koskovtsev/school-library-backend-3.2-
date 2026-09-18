import express from "express";
import mysql, { type RowDataPacket } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.use(express.json());
app.use(express.static("public"));

// Перший роут з отриманням даних про книги.(головна сторінка)
app.get("/", async (req, res) => {
  try {
    const offset = Number(req.query["offset"]) || 0;
    const limit = Number(req.query["limit"]) || 20;
    const [rows] = await pool.query(`SELECT books.name, authors.name
          FROM books 
          INNER JOIN book_authors ON books.id=book_authors.book_id
          INNER JOIN authors ON book_authors.author_id=authors.id
          LIMIT ${limit} OFFSET ${offset};`);
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total_books
          FROM books 
          INNER JOIN book_authors ON books.id=book_authors.book_id
          INNER JOIN authors ON book_authors.author_id=authors.id`);
    res.send(
      `<h1>Шкільна бібліотека працює!</h1><p>Тест бази даних успішний: результат = ${count[0]?.total_books} книжок в базі</p>`,
    );
  } catch (error) {
    console.error("Помилка підключення до БД:", error);
    res.status(500).send("Помилка підключення до бази даних");
  }
});

app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на http://localhost:${PORT}`);
});
