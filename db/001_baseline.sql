-- 001_baseline: початковий стан схеми library_db (03.11.2026)
CREATE TABLE `authors` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'Primary Key',
  `create_time` datetime DEFAULT NULL COMMENT 'Create Time',
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_authors_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `books` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'Primary Key',
  `create_time` datetime DEFAULT NULL COMMENT 'Create Time',
  `name` varchar(255) DEFAULT NULL,
  `description` text COMMENT 'Book description',
  `year` year DEFAULT NULL COMMENT 'Publication year',
  `n_pages` int DEFAULT NULL COMMENT 'Number of pages',
  `isbn` varchar(20) DEFAULT NULL COMMENT 'International Standard Book Number',
  `views_count` int DEFAULT '0' COMMENT 'Number of viwes',
  `clicks_count` int DEFAULT '0' COMMENT 'Number of WantIt-clicks',
  `deleted_at` datetime DEFAULT NULL,
  `cover_url` text COMMENT 'url to book cover',
  PRIMARY KEY (`id`),
  UNIQUE KEY `isbn` (`isbn`),
  KEY `idx_books_year` (`year`),
  KEY `idx_books_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `book_authors` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'Primary Key',
  `book_id` int NOT NULL,
  `author_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_book_author` (`book_id`,`author_id`),
  KEY `fk_book_authors_authors` (`author_id`),
  CONSTRAINT `fk_book_authors_authors` FOREIGN KEY (`author_id`) REFERENCES `authors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_book_authors_books` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Many-to-Many relation between books and authors';