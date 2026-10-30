import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import mysql, {
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import crypto from "crypto";
dotenv.config();

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
interface IDBResponse {
  rows: RowDataPacket[];
  totalFindedItems: number;
}
type PageItem = number | "ellipsis";
type ListParams = {
  offset: number;
  limit: number;
  queryFilter: QueryFilter;
};

const filterKeys = ["search", "author", "year"] as const;
const sortKeys = ["sort", "order"] as const;

const queryFilterKeys = [...filterKeys, ...sortKeys] as const;

type FilterKey = (typeof filterKeys)[number];

type QueryFilterKey = (typeof queryFilterKeys)[number];

type QueryFilter = Partial<Record<QueryFilterKey, string>>;

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

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "public/book-covers/"),
    filename: (req, file, cb) =>
      cb(
        null,
        `${Date.now()}-${crypto.randomUUID()}${ALLOWED_MIME[file.mimetype]}`,
      ),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED_MIME[file.mimetype]
      ? cb(null, true)
      : cb(new HttpError(400, "Дозволені лише JPG/PNG/WebP")),
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public", { index: false }));
//CSRF захист.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    req.method === "POST" &&
    origin &&
    new URL(origin).host !== req.headers.host
  )
    return res.status(403).send("Forbidden");
  next();
});

const basicAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  // Якщо заголовка немає — вимагаємо авторизацію
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    // Головна річ: статус 401 і заголовок WWW-Authenticate, який змушує браузер показати вікно
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).send("Потрібна авторизація");
  }

  const [type, base64Credentials] = authHeader.split(" ");
  if (type !== "Basic" || !base64Credentials) {
    return res.status(401).send("Невірний формат");
  }

  const credentials = Buffer.from(base64Credentials, "base64").toString("utf8");

  const [login, password] = credentials.split(":");

  // Перевіряємо логін і пароль
  if (login === "admin" && password === "admin") {
    return next();
  }

  // Якщо дані невірні — знову просимо вікно
  res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
  res.status(401).send("Невірний логін або пароль");
};

//костиль на работає. Подумать як обмануть хром, файрфокс, епл-хрінь
app.get("/admin/logout", (req, res) => {
  res.setHeader("WWW-Authenticate", 'Basic realm="Logged out"');
  // res.redirect(302, "/");
  res.status(401).send(`
    <h2>Ви успішно вийшли з системи!</h2>
    <p>Щоб повністю очистити пам'ять браузера, рекомендовано закрити цю вкладку.</p>
    <p><a href="/">На головну</a></p>
  `);
});

app.use(["/admin", "/add", "/del", "/upload"], basicAuthMiddleware);

const BOOKS_TEMPLATE_PATH = path.join(process.cwd(), "views", "index.html");
const ADMIN_TEMPLATE_PATH = path.join(process.cwd(), "views", "admin.html");
const BOOK_PAGE_TEMPLATE_PATH = path.join(
  process.cwd(),
  "views",
  "book-page.html",
);

async function getDataFromDB(
  offset: number,
  limit: number,
  queryFilter: QueryFilter,
  isAdmin = false,
): Promise<IDBResponse> {
  const filterParams = [];
  const select = `
   SELECT 
   books.id AS bookId, 
   books.name AS bookName, 
   books.cover_url AS bookCover,

   GROUP_CONCAT(authors.name SEPARATOR ', ') AS authorName 
   `;
  const fromJoins = ` FROM books
          INNER JOIN book_authors ON books.id = book_authors.book_id
          INNER JOIN authors ON book_authors.author_id = authors.id `;
  const adminSelect = `, books.views_count AS bookViews, books.year AS bookYear, books.clicks_count AS bookClicks `;
  const selectCount = ` SELECT COUNT(DISTINCT books.id) AS total `;
  let where = ` WHERE books.deleted_at IS NULL `;
  const authorSubquery = `
  books.id IN (
    SELECT bookAuthors.book_id
    FROM book_authors AS bookAuthors
    INNER JOIN authors AS author ON bookAuthors.author_id = author.id
    WHERE author.name LIKE ? 
  )`;
  const esc = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
  const whereSelector: Record<
    FilterKey,
    { where: string; searchParams: string[] }
  > = {
    search: {
      where: ` WHERE books.deleted_at IS NULL AND (books.name LIKE ? OR ${authorSubquery}) `,
      searchParams: [
        `${queryFilter.search ? esc(queryFilter.search) : ""}`,
        `${queryFilter.search ? esc(queryFilter.search) : ""}`,
      ],
    },
    author: {
      where: ` WHERE ${authorSubquery} AND books.deleted_at IS NULL`,
      searchParams: [`${queryFilter.author ? esc(queryFilter.author) : ""}`],
    },
    year: {
      where: ` WHERE books.year LIKE ? AND books.deleted_at IS NULL`,
      searchParams: [`${queryFilter.year ? esc(queryFilter.year) : ""}`],
    },
  };
  const sortColumns: Record<string, string> = {
    bookName: "books.name",
    bookYear: "books.year",
    bookClicks: "books.clicks_count",
  };
  // if (queryFilter.sort) {
  //   console.log(`querry: ${JSON.stringify(queryFilter)}`);
  // }
  const sortColumn =
    queryFilter.sort && Object.hasOwn(sortColumns, queryFilter.sort)
      ? sortColumns[queryFilter.sort]
      : undefined;
  // console.log(sortColumn);
  const sortOrder = queryFilter.order === "DESC" ? "DESC" : "ASC";
  const orderBy = sortColumn ? ` ORDER BY ${sortColumn} ${sortOrder} ` : "";

  const activeFilter = filterKeys.find((key) => queryFilter[key] !== undefined);
  if (activeFilter) {
    where = whereSelector[activeFilter].where;
    filterParams.push(...whereSelector[activeFilter].searchParams);
  }
  const groupBy = ` GROUP BY books.id `;
  const limitOffset = ` LIMIT ? OFFSET ? `;
  const selectSql = `${isAdmin ? select + adminSelect : select} ${fromJoins} ${where} ${groupBy} ${orderBy} ${limitOffset};`;
  const countSql = `${selectCount} ${fromJoins} ${where};`;
  // if (sortColumn) {
  //   console.log(`sql запит: ${selectSql}`);
  //   console.log(`каунт скл(для підрахунку скільки книг в базі) = ${countSql}`);
  //   console.log(`====================================`);
  // }
  const [rows] = await pool.query<RowDataPacket[]>(selectSql, [
    ...filterParams,
    limit,
    offset,
  ]);
  const [countRows] = await pool.query<RowDataPacket[]>(countSql, filterParams);
  const total = countRows[0]?.total ?? 0;
  return { rows, totalFindedItems: total };
}

function renderAdminBookPanel(
  book: RowDataPacket,
  queryFilter: QueryFilter,
): string {
  const queryStr = sortKeys
    .filter((key) => queryFilter[key])
    .map((key) => `&${key}=${encodeURIComponent(queryFilter[key]!)}`)
    .join("");
  const authorStr: string[] = (book.authorName ?? "")
    .split(", ")
    .map((author: string) => author.trim())
    .filter((author: string) => author.length > 0);
  const authorsHTML = authorStr
    .map(
      (author) =>
        `<a href="http://localhost:${PORT}/admin/?admin=1&author=${encodeURIComponent(author)}__QUERY__"><span id="author">${escapeHtml(author)}</span></a>`,
    )
    .join(", ");
  const html = `<tr>
                  <td>
                    <div class="book-title-cell">
                      <img class="book-thumb" src="__COVER__" alt="обкладинка">
                       <span class="book-name">__TITLE__</span>
                    </div>
                  </td>
                  <td>
                    <ul class="list-unstyled mb-0">
                      <li>${authorsHTML}</li>
                    </ul>
                  </td>
                  <td><a href="http://localhost:${PORT}/admin/?admin=1&year=__YEAR____QUERY__"><span>__YEAR__</span></a></td>
                  <td>
                    <form id="delBookForm" method="POST" action="/del/">
                      <input type="hidden" name="book_id" value="__ID__">
                      <button type="submit" class="btn btn-sm btn-outline-danger delete-book">Видалити</button>
                    </form>
                  </td>
                  <td>__CLICKS__</td>           
                </tr>`;
  return (
    html
      .replace(/__ID__/g, String(book.bookId ?? "--"))
      // .replace(/__AUTHOR__/g, escapeHtml(author))
      .replace(/__TITLE__/g, escapeHtml(book.bookName))
      .replace(/__COVER__/g, escapeHtml(book.bookCover))
      // .replace(/__ISBN__/g, String(isbn ?? '--'))
      .replace(/__YEAR__/g, String(book.bookYear ?? "--"))
      .replace(/__CLICKS__/g, String(book.bookClicks ?? "--"))
      .replace(/__QUERY__/g, queryStr)
  );
}

function isAdmin(req: express.Request) {
  return req.query["admin"] === "1";
}

function parseListParams(req: express.Request): ListParams | null {
  const offset = Number(req.query["offset"]) || 0;
  const limit = Math.min(Number(req.query["limit"]) || 5, 100);
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    return null;
  }

  const queryFilter: QueryFilter = {};

  for (const key of queryFilterKeys) {
    const value = req.query[key];
    if (typeof value === "string" && value !== "") {
      queryFilter[key] = value;
    }
  }

  return { offset, limit, queryFilter };
}

async function buildUserPage({ offset, limit, queryFilter }: ListParams) {
  const { rows, totalFindedItems } = await getDataFromDB(
    offset,
    limit,
    queryFilter,
  );
  const booksHtml = rows
    .map((row) =>
      renderBookPanel(row.bookId, row.bookName, row.authorName, row.bookCover),
    )
    .join("\n");
  const paginationHtml = renderPagination(
    offset,
    limit,
    totalFindedItems,
    queryFilter,
  );
  const template = await fs.readFile(BOOKS_TEMPLATE_PATH, "utf-8");
  return template
    .replace("<!--BOOKS-->", booksHtml)
    .replace("<!--PAGINATION-->", paginationHtml);
}

async function buildAdminPage({ offset, limit, queryFilter }: ListParams) {
  const { rows, totalFindedItems } = await getDataFromDB(
    offset,
    limit,
    queryFilter,
    true,
  );
  const booksBlock = rows
    .map((row) => renderAdminBookPanel(row, queryFilter))
    .join("\n");
  const paginationHtml = renderAdminPagination(
    offset,
    limit,
    totalFindedItems,
    queryFilter,
  );

  const template = await fs.readFile(ADMIN_TEMPLATE_PATH, "utf-8");
  return template
    .replace("<!--BOOKS-->", booksBlock)
    .replace("<!--PAGINATION-->", paginationHtml);
}

async function updateBookCounts(
  counter: "views_count" | "clicks_count",
  id: number,
): Promise<boolean> {
  const update = ` UPDATE books `;
  const setCount = ` SET ${counter} = ${counter} + 1 `;
  const where = ` WHERE id = ? AND deleted_at IS NULL `;
  const [updateResult] = await pool.query<ResultSetHeader>(
    `
      ${update}
      ${setCount}
      ${where}
      `,
    [id],
  );
  return updateResult.affectedRows !== 0;
}

async function getBookData(id: number): Promise<RowDataPacket[]> {
  const [bookData] = await pool.query<RowDataPacket[]>(
    `SELECT 
      books.id AS bookId, 
      books.name AS bookName, 
      books.description AS bookDescription,
      books.year AS bookYear,
      books.n_pages AS bookPages,
      books.isbn AS bookIsbn,
      books.cover_url AS bookCover,
      books.views_count AS bookViewsCount,
      books.clicks_count AS bookClicksCount,
      
      GROUP_CONCAT(authors.name SEPARATOR '||') AS authorName
      FROM books 
      INNER JOIN book_authors ON books.id=book_authors.book_id
      INNER JOIN authors ON book_authors.author_id=authors.id
      WHERE books.id=? AND books.deleted_at IS NULL`,
    [id],
  );
  return bookData;
}

async function softDeleteBook(id: number): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE books SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL;`,
    [id],
  );
  return result.affectedRows !== 0;
}

app.post("/del/", async (req, res) => {
  const id = Number(req.body.book_id);
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Невірний ідентифікатор книги");

  const isBookDeleted = await softDeleteBook(id);
  if (!isBookDeleted)
    throw new HttpError(400, "Не вдалось видалити книгу з БД");

  res.redirect("/admin/");
});
app.get("/book/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    throw new HttpError(400, "Невірний ідентифікатор книги");

  const isCountUpdated = await updateBookCounts("views_count", id);

  if (!isCountUpdated) throw new HttpError(404, "Книгу не знайдено");

  const bookData = await getBookData(id);

  if (bookData[0]?.bookId === null)
    throw new HttpError(404, "Книгу не знайдено");

  const bookHtml = renderBook(bookData);
  const template = await fs.readFile(BOOK_PAGE_TEMPLATE_PATH, "utf-8");
  const html = template.replace("<!--BOOK-->", bookHtml);
  res.type("html").send(html);
});

app.post("/book/", async (req, res) => {
  const bookId = Number(req.body.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0)
    throw new HttpError(400, "Невірний ідентифікатор книги");

  const isCountUpdated = await updateBookCounts("clicks_count", bookId);
  if (!isCountUpdated) throw new HttpError(404, "Книгу не знайдено");

  res.status(200).send({ ok: "OK" });
});

app.get("/", async (req, res) => {
  const params = parseListParams(req);
  if (!params) throw new HttpError(400, "Невірний формат query параметрів");

  const html =
    // isAdmin(req)
    // ? await buildAdminPage(params)
    // :
    await buildUserPage(params);
  res.type("html").send(html);
});

app.get("/admin", basicAuthMiddleware, async (req, res) => {
  const params = parseListParams(req);
  if (!params) throw new HttpError(400, "Невірний формат query параметрів");
  const html = await buildAdminPage(params);
  res.type("html").send(html);
});

function getAdminParams(req: express.Request) {
  const title = String(req.body.title || "");
  // const admin = isAdmin(req);
  const year = req.body.year ? Number(req.body.year) : null;
  const isbn = String(req.body.isbn || "");
  const pagesNumber = req.body.n_pages ? Number(req.body.n_pages) : null;
  const coverUrl = String(req.body.cover_url) || "";
  const authorOne = String(req.body.author1 || "");
  const authorTwo = String(req.body.author2 || "");
  const authorThre = String(req.body.author3 || "");
  const descriptiopn = String(req.body.description || "");

  return {
    title,
    // admin,
    year,
    coverUrl,
    isbn,
    pagesNumber,
    authorOne,
    authorTwo,
    authorThre,
    descriptiopn,
  };
}

async function addAuthors(authors: string[]) {
  const findAuthor = `
    SELECT authors.name AS authorName, authors.id AS authorId
    FROM authors
    WHERE authors.name=?
    `;

  const addAuthor = `
            INSERT INTO authors (create_time, name)
            VALUES (NOW(), ?)
            `;
  if (authors.length < 1) {
    return null;
  }
  const authorIds = await Promise.all(
    authors.map(async (author) => {
      const [rows] = await pool.query<RowDataPacket[]>(findAuthor, [author]);
      if (rows.length > 0) {
        return Number(rows[0]?.authorId);
      }

      const [result] = await pool.execute<mysql.ResultSetHeader>(addAuthor, [
        author,
      ]);
      return result.insertId;
    }),
  );
  return authorIds;
}

async function addAuthorsToBook(bookId: number, authorsIds: number[]) {
  const bookAuthor = `
      INSERT INTO book_authors (book_id, author_id) 
      VALUES (?,?)
    `;
  await Promise.all(
    authorsIds.map((authorId) => pool.execute(bookAuthor, [bookId, authorId])),
  );
}

async function addBookToDB(
  values: (string | number | null)[],
  authors: string[],
) {
  const addBook = `
    INSERT INTO books (create_time, name, description, year, isbn, n_pages, cover_url) 
    VALUES (NOW(), ?, ?, ?, ?, ?, ?);
    `;
  const [result] = await pool.execute<mysql.ResultSetHeader>(addBook, values);
  if (result.affectedRows === 0) {
    return false;
  }
  const bookId = result.insertId;
  const authorIds = await addAuthors(authors);
  if (!authorIds) return false;
  await addAuthorsToBook(bookId, authorIds);

  return true;
}

app.post("/add", upload.single("cover"), async (req, res) => {
  const {
    title,
    // admin,
    year,
    coverUrl,
    isbn,
    pagesNumber,
    authorOne,
    authorTwo,
    authorThre,
    descriptiopn,
  } = getAdminParams(req);

  // if (!admin) throw new HttpError(403, "Не авторизовано");

  if (!title || !authorOne)
    throw new HttpError(400, "Нема назви книги чи автора");

  const values: (string | number | null)[] = [
    title,
    descriptiopn,
    year,
    isbn,
    pagesNumber,
    coverUrl,
  ];

  const authors = [authorOne, authorTwo, authorThre]
    .map((author) => author.trim())
    .filter((aurhor) => aurhor.length > 0);
  const isBookAdded = await addBookToDB(values, authors);
  if (!isBookAdded) throw new HttpError(400, "Не вдалось додати книгу до БД");

  res.redirect("/admin/");
});

app.post("/upload/image", upload.single("cover"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Файл не знайдено");

  const filePath = `/book-covers/${req.file.filename}`;

  res.json({ success: true, filePath: filePath });
});

function renderBook(book: RowDataPacket[]): string {
  const authors: string[] = (book[0]?.authorName ?? "")
    .split("||")
    .map((author: string) => author.trim())
    .filter((author: string) => author.length > 0);
  const authorsHTML = authors
    .map(
      (author) =>
        `<a href="http://localhost:${PORT}/?author=${encodeURIComponent(author)}"><span id="author">${escapeHtml(author)}</span></a>`,
    )
    .join(", ");
  return `<div id="id" book-id="__ID__">
            <div id="bookImg" class="col-xs-12 col-sm-3 col-md-3 item"><img src="__COVER__"
              alt="Responsive image" class="img-responsive">
              <hr>
            </div>
            <div class="col-xs-12 col-sm-9 col-md-9 col-lg-9 info">
              <div class="bookInfo col-md-12">
                <div id="title" class="titleBook">__TITLE__</div>
              </div>
              <div class="col-xs-12 col-sm-12 col-md-12 col-lg-12">
                <div class="bookLastInfo">
                  <div class="bookRow"><span class="properties">автор:</span>${authorsHTML}</div>
                  <div class="bookRow"><span class="properties">год:</span><a href="http://localhost:${PORT}/?year=__YEAR__"><span id="year">__YEAR__</span></a></div>
                  <div class="bookRow"><span class="properties">страниц:</span><span id="pages">__PAGES__</span></div>
                  <div class="bookRow"><span class="properties">isbn:</span><span id="isbn">__ISBN__</span></div>
                </div>
                <div class="btnBlock col-xs-12 col-sm-12 col-md-12">
                  <button type="button" class="btnBookID btn-lg btn btn-success">Хочу читать!</button>
                </div>
                <div class="bookDescription col-xs-12 col-sm-12 col-md-12 hidden-xs hidden-sm">
                  <h4>О книге</h4>
                  <hr>
                  <p id="description">__DESCRIPTION__</p>
                </div>
              </div>
              <div class="bookDescription col-xs-12 col-sm-12 col-md-12 hidden-md hidden-lg">
                <h4>О книге</h4>
                <hr>
                <p class="description">__DESCRIPTION__</p>
              </div>
            </div>
          </div>`
    .replace(/__ID__/g, String(book[0]?.bookId ?? "--"))
    .replace(/__TITLE__/g, escapeHtml(book[0]?.bookName))
    .replace(/__YEAR__/g, String(book[0]?.bookYear ?? "--"))
    .replace(/__PAGES__/g, String(book[0]?.bookPages ?? "--"))
    .replace(/__ISBN__/g, String(book[0]?.bookIsbn ?? "--"))
    .replace(/__COVER__/g, escapeHtml(book[0]?.bookCover))
    .replace(/__DESCRIPTION__/g, escapeHtml(book[0]?.bookDescription));
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBookPanel(
  id: number,
  title: string,
  author: string,
  cover: string,
): string {
  return `<div data-book-id="__ID__" class="book_item col-xs-6 col-sm-3 col-md-2 col-lg-2">
            <div class="book">
              <a href="http://localhost:${PORT}/book/__ID__"><img src="__COVER__" alt="__TITLE__">
                <div data-title="__TITLE__" class="blockI" style="height: 46px;">
                 <div data-book-title="__TITLE__" class="title size_text">__TITLE__</div>
                  <div data-book-author="__AUTHOR__" class="author">__AUTHOR__</div>
                </div>
              </a>
              <a href="http://localhost:${PORT}/book/__ID__">
               <button type="button" class="details btn btn-success">Читать</button>
              </a>
            </div>
          </div>`
    .replace(/__ID__/g, String(id ?? "--"))
    .replace(/__AUTHOR__/g, escapeHtml(author))
    .replace(/__COVER__/g, escapeHtml(cover))
    .replace(/__TITLE__/g, escapeHtml(title));
}

/** *ПАГІНАЦІЯ*
 * Повертає список для відображення, напр. [1, 2, 3, "ellipsis", 14, 15, 16, "ellipsis", 30, 31, 32]
 * edge     – скільки сторінок показувати на початку і в кінці
 * siblings – скільки сторінок показувати навколо поточної
 */
function getPageItems(
  currentPage: number,
  totalPages: number,
  edge = 3,
  siblings = 1,
): PageItem[] {
  const pages = new Set<number>();

  for (let i = 1; i <= Math.min(edge, totalPages); i++) pages.add(i);
  for (let i = Math.max(totalPages - edge + 1, 1); i <= totalPages; i++) {
    pages.add(i);
  }
  for (let i = currentPage - siblings; i <= currentPage + siblings; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: PageItem[] = [];
  let prev = 0;

  for (const page of sorted) {
    const gap = page - prev;
    if (gap === 2) {
      result.push(prev + 1);
    } else if (gap > 2) {
      result.push("ellipsis");
    }
    result.push(page);
    prev = page;
  }

  return result;
}

function buildPageUrl(
  offset: number,
  limit: number,
  filter: QueryFilter,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams(extra);
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined) params.set(key, value);
  }
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  return escapeHtml(`/admin/?${params.toString()}`);
}

function renderAdminPagination(
  offset: number,
  limit: number,
  total: number,
  filter: QueryFilter,
): string {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(Math.floor(offset / limit) + 1, totalPages);
  const pageUrl = (page: number) =>
    buildPageUrl((page - 1) * limit, limit, filter, { admin: "1" });
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const prevHtml = hasPrev
    ? `<li class="page-item"><a class="page-link" href="${pageUrl(currentPage - 1)}">&laquo;</a></li>`
    : `<li class="page-item disabled"><span class="page-link">&laquo;</span></li>`;

  const nextHtml = hasNext
    ? `<li class="page-item"><a class="page-link" href="${pageUrl(currentPage + 1)}">&raquo;</a></li>`
    : `<li class="page-item disabled"><span class="page-link">&raquo;</span></li>`;

  const pagesHtml = getPageItems(currentPage, totalPages)
    .map((item) => {
      if (item === "ellipsis") {
        return `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      }
      if (item === currentPage) {
        return `<li class="page-item active" aria-current="page"><span class="page-link">${item}</span></li>`;
      }
      return `<li class="page-item"><a class="page-link" href="${pageUrl(item)}">${item}</a></li>`;
    })
    .join("");

  return `<nav aria-label="Навігація по сторінках">
            <ul class="pagination">
              ${prevHtml}
              ${pagesHtml}
              ${nextHtml}
            </ul>
          </nav>`;
}

function renderPagination(
  offset: number,
  limit: number,
  total: number,
  filter: QueryFilter,
): string {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;
  const filterInputs = Object.entries(filter)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`,
    )
    .join("");
  return `
    <div class="pagination-controls" style="margin-top:20px; display:flex; align-items:center; gap:10px;">
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${prevOffset}">
        <input type="hidden" name="limit" value="${limit}">
        ${filterInputs}
        <button type="submit" class="btn btn-default" ${hasPrev ? "" : "disabled"}>← Назад</button>
      </form>
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${nextOffset}">
        <input type="hidden" name="limit" value="${limit}">
        ${filterInputs}
        <button type="submit" class="btn btn-default" ${hasNext ? "" : "disabled"}>Вперед →</button>
      </form>
    </div>`;
}

app.use((req, res) => {
  res.status(404).send("Сторінку не знайдено");
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).send(err.message);
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).send(`Помилка завантаження файлу: ${err.message}`);
  }
  // помилки body-parser (кривий JSON тощо) мають status 4xx
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500
  ) {
    return res.status(err.status).send("Невірний запит");
  }
  if (
    typeof err === "object" &&
    err !== null &&
    ("errno" in err || "code" in err)
  ) {
    // Тепер TS знає, що тут є ці поля, але щоб уникнути помилок типізації,
    // приведемо err до зручнішого типу або перевіримо конкретні значення:
    const dbErr = err as { errno?: number; code?: string };

    if (dbErr.errno === 1264 || dbErr.code === "ER_WARN_DATA_OUT_OF_RANGE") {
      return res.status(400).json({
        error:
          "Некоректне значення року! Будь ласка, введіть реальний рік (наприклад, від 1900 до 2026).",
      });
    }
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: "Внутрішня помилка сервера" });
});

app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на http://localhost:${PORT}`);
});
