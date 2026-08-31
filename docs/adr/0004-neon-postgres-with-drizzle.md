# Neon Postgres with Drizzle

Courses, Course revisions, Completion, Sources, and Tutor and Tailor histories are relational and private to each Learner, so Mikasa uses Neon Postgres. Drizzle keeps the schema in TypeScript and migrations as SQL files. Lesson fragments use pgvector in the same database, starting with exact search and adding an approximate index only after measurements require one.
