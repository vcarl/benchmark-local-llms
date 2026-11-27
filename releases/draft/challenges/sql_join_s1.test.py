import sqlite3
from collections import Counter

SETUP = "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT);\nCREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), amount INTEGER);\nINSERT INTO customers VALUES (1, 'Ada Brooks', 'Graz');\nINSERT INTO customers VALUES (2, 'Bilal Khan', 'Graz');\nINSERT INTO customers VALUES (3, 'Carmen Ortiz', 'Graz');\nINSERT INTO customers VALUES (4, 'Dev Patel', 'Graz');\nINSERT INTO customers VALUES (5, 'Elena Petrova', 'Bergen');\nINSERT INTO customers VALUES (6, 'Femi Adeyemi', 'Tartu');\nINSERT INTO customers VALUES (7, 'Greta Lind', 'Tartu');\nINSERT INTO customers VALUES (8, 'Hugo Martin', 'Bergen');\nINSERT INTO orders VALUES (1001, 2, 280);\nINSERT INTO orders VALUES (1002, 5, 468);\nINSERT INTO orders VALUES (1003, 8, 80);\nINSERT INTO orders VALUES (1004, 6, 132);\nINSERT INTO orders VALUES (1005, 3, 159);\nINSERT INTO orders VALUES (1006, 3, 140);\nINSERT INTO orders VALUES (1007, 1, 545);\nINSERT INTO orders VALUES (1008, 5, 474);\nINSERT INTO orders VALUES (1009, 1, 80);\nINSERT INTO orders VALUES (1010, 1, 152);\nINSERT INTO orders VALUES (1011, 5, 458);\nINSERT INTO orders VALUES (1012, 4, 350);\nINSERT INTO orders VALUES (1013, 7, 481);\nINSERT INTO orders VALUES (1014, 7, 263);\nINSERT INTO orders VALUES (1015, 5, 412);\nINSERT INTO orders VALUES (1016, 1, 541);"
REFERENCE = "SELECT DISTINCT c.name FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.city = 'Graz' AND o.amount > 280 ORDER BY c.name;"
_READ_ONLY = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}

def _rows(sql):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SETUP)
    conn.set_authorizer(lambda op, *_: sqlite3.SQLITE_OK if op in _READ_ONLY else sqlite3.SQLITE_DENY)
    return conn.execute(sql).fetchall()

_expected = _rows(REFERENCE)
_got = _rows(SUBMISSION)
assert _got == _expected, "rows %r != expected %r" % (_got[:5], _expected[:5])
