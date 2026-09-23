# Private Lesson context summaries

Keep Lesson generation sequential, but give each writer the Course specification, private context summaries from all earlier Lessons in reading order, and the complete immediately previous Lesson. Each writer returns its Lesson and a concise summary of the exact names, shared example changes, decisions, and promises that later Lessons must honor. This replaces the capped prose from every earlier Lesson in ADR 0009 because that repeated context grows with the Course and can omit facts outside each excerpt.

Store the summary with its Lesson and refresh it whenever correction changes the Lesson. Complete Course review checks summaries for harmful drift and rechecks later Lessons after a misleading summary is repaired. The Outline summary remains Learner-facing and separate. Keep the Course specification authoritative, the existing review bound, and atomic publication.
