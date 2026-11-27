import sqlite3
from collections import Counter

SETUP = "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, status TEXT, amount INTEGER, placed_on TEXT);\nINSERT INTO orders VALUES (101, 'Bilal Khan', 'shipped', 320, '2022-09-30');\nINSERT INTO orders VALUES (102, 'Hugo Martin', 'shipped', 142, '2022-09-14');\nINSERT INTO orders VALUES (103, 'Carmen Ortiz', 'cancelled', 270, '2022-09-12');\nINSERT INTO orders VALUES (104, 'Femi Adeyemi', 'shipped', 281, '2022-10-24');\nINSERT INTO orders VALUES (105, 'Femi Adeyemi', 'pending', 416, '2022-09-07');\nINSERT INTO orders VALUES (106, 'Femi Adeyemi', 'pending', 385, '2022-09-14');\nINSERT INTO orders VALUES (107, 'Jun Park', 'shipped', 220, '2022-10-24');\nINSERT INTO orders VALUES (108, 'Hugo Martin', 'shipped', 151, '2022-08-16');\nINSERT INTO orders VALUES (109, 'Carmen Ortiz', 'shipped', 139, '2022-09-26');\nINSERT INTO orders VALUES (110, 'Elena Petrova', 'shipped', 431, '2022-09-08');\nINSERT INTO orders VALUES (111, 'Dev Patel', 'cancelled', 88, '2022-09-23');\nINSERT INTO orders VALUES (112, 'Jun Park', 'pending', 367, '2022-10-27');\nINSERT INTO orders VALUES (113, 'Isla Grant', 'shipped', 378, '2022-09-20');\nINSERT INTO orders VALUES (114, 'Elena Petrova', 'cancelled', 124, '2022-09-11');"
REFERENCE = "SELECT COUNT(*), SUM(amount) FROM orders WHERE status = 'shipped' AND placed_on LIKE '2022-09-%';"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert Counter(_got) == Counter(_expected), "rows %r != expected %r (any order)" % (_got[:5], _expected[:5])
