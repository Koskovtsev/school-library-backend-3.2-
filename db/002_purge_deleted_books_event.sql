CREATE EVENT ev_purge_deleted_books
ON SCHEDULE EVERY 1 DAY 
DO
    DELETE FROM books 
    WHERE deleted_at IS NOT NULL 
        AND deleted_at < NOW() - INTERVAL 1 MONTH