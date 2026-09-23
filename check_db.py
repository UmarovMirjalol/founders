import sqlite3
conn = sqlite3.connect('data/founders.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()
rows = c.execute('SELECT * FROM opportunities').fetchall()
for r in rows:
    d = {k: r[k] for k in r.keys()}
    print(d)
conn.close()
