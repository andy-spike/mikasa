/**
 * Authored demonstration content for the course workspace.
 * Synthetic: no real learner, no real usage data. Replaced by generated
 * Course data once the Outline and Lesson jobs are wired up.
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "sql"; code: string }
  | { kind: "note"; title: string; text: string }
  | {
      kind: "table";
      head: string[];
      rows: string[][];
      caption: string;
    };

export type LessonStatus = "done" | "set" | "unset";

export type Lesson = {
  /** Stable across Tailor changes. Lesson numbers are derived from position. */
  id: string;
  title: string;
  summary: string;
  minutes: number;
  status: LessonStatus;
  /** Date the Exercise was marked done, as it reads on the stamp. */
  stampedOn?: string;
  body?: Block[];
  exercise?: { task: string; check: string };
};

export type Module = {
  numeral: string;
  title: string;
  lessons: Lesson[];
};

export type Course = {
  id: string;
  topic: string;
  goal: string;
  depth: string;
  background: string;
  grounding: boolean;
  startedOn: string;
  modules: Module[];
};

export type TutorTurn = { from: "learner" | "tutor"; text: string };

export type TailorChange = {
  id: string;
  verb: "add" | "split" | "move";
  entry: string;
  detail: string;
  reason: string;
};

export type NumberedLesson = Lesson & {
  n: number;
  moduleNumeral: string;
  moduleTitle: string;
};

export const course: Course = {
  id: "window-functions",
  topic: "SQL window functions",
  goal: "Answer my own questions about our usage data without waiting on the data team",
  depth: "Solid working knowledge",
  background:
    "I write basic SELECTs and JOINs. GROUP BY makes sense right up until I need the detail rows back.",
  grounding: true,
  startedOn: "11 AUG 2026",
  modules: [
    {
      numeral: "I",
      title: "Where GROUP BY runs out",
      lessons: [
        {
          id: "l1",
          title: "The question GROUP BY cannot answer",
          summary:
            "Why the detail rows vanish the moment you aggregate, and what that costs you.",
          minutes: 9,
          status: "done",
          stampedOn: "12 AUG 2026",
          body: [
            {
              kind: "p",
              text: "You have a table of daily events and a simple question: which days were unusually busy for a given user? So you write the obvious thing.",
            },
            {
              kind: "sql",
              code: `select user_id, sum(events) as total
from daily_events
group by user_id;`,
            },
            {
              kind: "p",
              text: "And you get one row per user, which is not the question you asked. `group by` collapses. It takes every row sharing a value and folds them into a single output row, and the individual days are gone. You cannot ask a folded row what any particular day looked like, because that row is no longer a day.",
            },
            {
              kind: "p",
              text: "The usual escape is to run the query twice. Once for the per-user total, once for the daily detail, then join them back together. That works. It also means the database reads the same table twice, and you now maintain a join condition that exists only to undo damage you did to yourself.",
            },
            {
              kind: "note",
              title: "The shape of the problem",
              text: "Any question of the form 'this row, compared to its group' needs both the row and the group in one result. GROUP BY gives you one or the other.",
            },
            {
              kind: "p",
              text: "Window functions are the other answer. They compute across a set of rows the way an aggregate does, then attach the result to every row instead of replacing them. Same arithmetic, different shape of output. The rest of this Module is about that shape.",
            },
          ],
          exercise: {
            task: "Write two queries against `daily_events`: one returning a per-user total, one returning every raw day. Compare the row counts. Then write the join that puts the total next to each day, and time it. Keep that query. You will delete it in Lesson 4.",
            check:
              "Done when the joined result is on screen and you can say how many times the table was scanned.",
          },
        },
        {
          id: "l2",
          title: "OVER (), and what a window really is",
          summary:
            "The empty parentheses are the whole idea. Everything after this narrows them.",
          minutes: 11,
          status: "done",
          stampedOn: "14 AUG 2026",
          body: [
            {
              kind: "p",
              text: "`over ()` turns an aggregate into a window function. That is the entire syntax, and the empty parentheses are not a placeholder for something you forgot to type.",
            },
            {
              kind: "sql",
              code: `select
  user_id,
  day,
  events,
  sum(events) over () as events_all_users
from daily_events;`,
            },
            {
              kind: "p",
              text: "Empty parentheses mean the window is every row the query produced. So `events_all_users` holds the same number on every row, and every raw row survives. Compare that to the GROUP BY in Lesson 1, which returned one row per user and nothing else.",
            },
            {
              kind: "p",
              text: "A window is a set of rows that one output row is allowed to look at. That is the whole definition. `partition by` shrinks the set, `order by` puts it in an order, and a frame clause trims it further. With nothing in the parentheses, the set is all of them.",
            },
            {
              kind: "note",
              title: "Where in the query it runs",
              text: "Window functions run after FROM, WHERE, GROUP BY and HAVING, and before the outer ORDER BY and LIMIT. That order explains most of the errors ahead.",
            },
            {
              kind: "p",
              text: "One consequence worth pinning now. Because the window runs after WHERE, a row that WHERE removed is in no window at all. Filtering changes the answer, not just the display. This catches people who add a WHERE to look at one user and then wonder why every total moved.",
            },
          ],
          exercise: {
            task: "Run the query above on your own table. Then add `where day >= current_date - 30` and run it again. Note what happened to `events_all_users` and write one sentence explaining why.",
            check: "Done when your sentence names WHERE running before the window.",
          },
        },
        {
          id: "l3",
          title: "Your first running total",
          summary:
            "Add ORDER BY inside the parentheses and the sum starts accumulating.",
          minutes: 10,
          status: "done",
          stampedOn: "19 AUG 2026",
          body: [
            {
              kind: "p",
              text: "Put an ORDER BY inside the OVER clause and the aggregate stops being one total and starts being a running one.",
            },
            {
              kind: "sql",
              code: `select
  day,
  events,
  sum(events) over (order by day) as events_to_date
from daily_events
order by day;`,
            },
            {
              kind: "p",
              text: "On the first row `events_to_date` equals its own `events`. On the second it equals the first two added together, and so on to the end. Nothing else changed. You added three words and got a cumulative column with no self join, no correlated subquery, no second pass.",
            },
            {
              kind: "p",
              text: "Ordering the window is what defines 'so far'. Without it there is no 'so far', only 'in total', which is why the empty window in Lesson 2 gave you a flat number. The ORDER BY inside OVER is a different thing from the ORDER BY at the end of the query, and you usually want both.",
            },
            {
              kind: "note",
              title: "Two ORDER BYs, two jobs",
              text: "The one inside OVER decides what the function sees. The one at the end decides what you see. Changing the outer one never changes the numbers.",
            },
            {
              kind: "p",
              text: "This still runs across the whole table, though, which is rarely what anyone wants. Every user's events pile into one total. Lesson 5 fixes that.",
            },
          ],
          exercise: {
            task: "Add a second column to the query above: `avg(events) over (order by day)`, the running average. Read the last row. It should equal a plain `avg(events)` over the whole table.",
            check: "Done when the two numbers match.",
          },
        },
        {
          id: "l4",
          title: "Windows or subqueries",
          summary:
            "The correlated subquery you were about to write, and why the window beats it.",
          minutes: 12,
          status: "done",
          stampedOn: "24 AUG 2026",
          body: [
            {
              kind: "p",
              text: "Before window functions this was the standard move, a correlated subquery in the SELECT list.",
            },
            {
              kind: "sql",
              code: `select
  d.user_id,
  d.day,
  d.events,
  (select sum(events)
     from daily_events x
    where x.user_id = d.user_id
      and x.day <= d.day) as events_to_date
from daily_events d
order by d.user_id, d.day;`,
            },
            {
              kind: "p",
              text: "It produces the right answer. It also runs the inner query once per output row, at least conceptually, and the planner has to work to turn that into something reasonable. On a table of any size you feel it.",
            },
            {
              kind: "p",
              text: "The window version says the same thing in one pass, and reads better besides.",
            },
            {
              kind: "sql",
              code: `select
  user_id,
  day,
  events,
  sum(events) over (partition by user_id order by day) as events_to_date
from daily_events
order by user_id, day;`,
            },
            {
              kind: "p",
              text: "Both are correct. The window version is shorter, states the intent rather than the mechanism, and leaves the planner one sort to do instead of a nested lookup to unpick. Subqueries still win when you need rows the outer query does not have: a different table, a different grain, a filter the outer query cannot apply.",
            },
            {
              kind: "note",
              title: "The one thing a window cannot do",
              text: "It cannot reach a row your FROM and WHERE did not return. If the answer lives outside the result set, you need a join or a subquery.",
            },
          ],
          exercise: {
            task: "Take the join you wrote in Lesson 1 and rewrite it as a single window query. Run both and diff the output row for row. Then compare the two plans.",
            check:
              "Done when the outputs match and you can point at the extra scan in the older plan.",
          },
        },
      ],
    },
    {
      numeral: "II",
      title: "Partitioning and ordering",
      lessons: [
        {
          id: "l5",
          title: "PARTITION BY, one window per group",
          summary: "One window per user, per account, per whatever you name.",
          minutes: 14,
          status: "set",
          body: [
            {
              kind: "p",
              text: "The running total you wrote in Lesson 3 counted every row in the table, start to finish. That is almost never the question. You want the running total per user, or per account, or per plan tier. `partition by` is how you say so.",
            },
            {
              kind: "sql",
              code: `select
  user_id,
  day,
  events,
  sum(events) over (partition by user_id order by day) as events_to_date
from daily_events
order by user_id, day;`,
            },
            {
              kind: "table",
              head: ["user_id", "day", "events", "events_to_date"],
              rows: [
                ["ua_1041", "2026-08-03", "12", "12"],
                ["ua_1041", "2026-08-04", "31", "43"],
                ["ua_1041", "2026-08-05", "8", "51"],
                ["ua_1041", "2026-08-06", "44", "95"],
                ["ua_2277", "2026-08-03", "5", "5"],
                ["ua_2277", "2026-08-04", "9", "14"],
                ["ua_2277", "2026-08-05", "27", "41"],
              ],
              caption:
                "The count restarts at ua_2277. That restart is the whole feature.",
            },
            {
              kind: "p",
              text: "Read the OVER clause left to right and it says what it does. `partition by user_id` splits the rows into one window per user. `order by day` decides what 'so far' means inside each window. The sum then runs down each window on its own, and the moment `user_id` changes the count starts over at the first row of the new window.",
            },
            {
              kind: "p",
              text: "If GROUP BY is a blender, PARTITION BY is a set of dividers. GROUP BY folds your rows into one row per group and the detail is gone. PARTITION BY leaves every row exactly where it was and only decides which other rows each row is allowed to see. That is the whole difference, and it is why the raw `events` column and the running total can sit side by side in one SELECT.",
            },
            {
              kind: "p",
              text: "Partitions take more than one column, and those columns do not have to be the ones you ordered by.",
            },
            {
              kind: "sql",
              code: `sum(events) over (
  partition by account_id, plan_tier
  order by day
) as events_to_date`,
            },
            {
              kind: "note",
              title: "PARTITION BY does not filter",
              text: "Rows outside a partition still come back in your result. They belong to a different window, that is all. If you want fewer rows, that is still WHERE's job.",
            },
            {
              kind: "p",
              text: "The second trap is the one that costs an afternoon. You cannot filter on a window function in WHERE, because the window runs after WHERE and the column does not exist yet. Wrap the query and filter outside it.",
            },
            {
              kind: "sql",
              code: `with ranked as (
  select
    user_id,
    day,
    events,
    sum(events) over (partition by user_id order by day) as events_to_date
  from daily_events
)
select * from ranked
where events_to_date >= 100;`,
            },
            {
              kind: "p",
              text: "That CTE is not ceremony. It is the only place the filter can go, and you will write it constantly once ranking arrives in Module III.",
            },
          ],
          exercise: {
            task: "Against your own `daily_events` table, write one query that returns, for every row: the user's running total, that user's total for the whole period, and the running total as a percentage of it, so a row can read '340 of 1,240 events, 27%'. You need two windows in the same SELECT, one ordered and one not.",
            check:
              "Done when the last row for any user shows a running total equal to that user's period total. If it does not, look first at the ORDER BY inside the window.",
          },
        },
        {
          id: "l6",
          title: "What ORDER BY does inside a window",
          summary:
            "Ordering the window creates 'so far'. It also creates ties, and ties have opinions.",
          minutes: 11,
          status: "set",
          body: [
            {
              kind: "p",
              text: "You used ORDER BY inside a window in Lesson 3 to get a running total. It does one more thing, which nobody mentions until it breaks something: it decides how ties behave.",
            },
            {
              kind: "p",
              text: "When two rows in the same partition hold the same value in the window's ORDER BY, the database cannot tell them apart. It has to decide whether the second row comes after the first. For most functions the default answer is that tied rows occupy one position, and each of them sees all the others.",
            },
            {
              kind: "sql",
              code: `select
  day,
  events,
  sum(events) over (order by day) as running
from daily_events
where user_id = 'ua_1041';`,
            },
            {
              kind: "p",
              text: "If `day` is unique per user this is fine. The moment two rows share a day, both get the same `running` value and that value includes both of them. It is rarely what you wanted and it is not a bug. It follows from the default frame, which Lesson 7 takes apart.",
            },
            {
              kind: "note",
              title: "Make the order total",
              text: "Add a tiebreaker whenever ties are possible. `order by day, event_id` costs nothing and removes the ambiguity for good.",
            },
            {
              kind: "p",
              text: "`nulls first` and `nulls last` work inside a window's ORDER BY exactly as they do outside it. If your ordering column is nullable, say which you want, because the default differs between databases.",
            },
          ],
          exercise: {
            task: "Insert a duplicate day for one user, then run the running total with and without a tiebreaker in the window's ORDER BY. Write down both results for the tied rows.",
            check:
              "Done when you can explain the difference without running the query again.",
          },
        },
        {
          id: "l7",
          title: "Frames: ROWS, RANGE, and the default that bites",
          summary:
            "The frame decides how much of the window each row can actually see.",
          minutes: 15,
          status: "set",
          body: [
            {
              kind: "p",
              text: "A window has one more layer you have not touched. The partition names the rows, the ORDER BY sorts them, and the frame decides how many of those sorted rows the current row may see. It is the layer almost nobody writes.",
            },
            {
              kind: "p",
              text: "When you write `over (order by day)` and stop, you are not getting 'every row up to this one'. You are getting the default frame, `range between unbounded preceding and current row`. Note the word `range`: the frame extends through every row whose ORDER BY value equals the current row's, which is exactly the tie behaviour from Lesson 6.",
            },
            {
              kind: "sql",
              code: `-- these two are not the same query
sum(events) over (order by day)
sum(events) over (order by day rows between unbounded preceding and current row)`,
            },
            {
              kind: "p",
              text: "`rows` counts physical rows. `range` counts values. With unique ordering values the two agree, which is why the difference stays hidden until the day it does not.",
            },
            {
              kind: "note",
              title: "The rule of thumb",
              text: "Write ROWS when you mean the last N rows. Write RANGE when you mean everything at or before this value. Leaving it out means RANGE, whether you meant it or not.",
            },
            {
              kind: "p",
              text: "Frames are also how you get moving windows. A seven-day trailing average is a frame, not a filter.",
            },
            {
              kind: "sql",
              code: `avg(events) over (
  partition by user_id
  order by day
  rows between 6 preceding and current row
) as avg_7d`,
            },
            {
              kind: "p",
              text: "That reads as: this row and the six rows before it, within this user. The trap is sitting inside it. `rows` counts rows, not days, so a user with a missing day gets a seven-row average spanning eight calendar days. If the calendar matters, `range between interval '6 days' preceding and current row` is the honest version, where your database supports it.",
            },
          ],
          exercise: {
            task: "Build the seven-day trailing average above, delete one day's row for a user, and run it again. Find the row where the average now covers eight calendar days. Then rewrite it with a RANGE interval frame and confirm the gap is handled.",
            check:
              "Done when the two versions disagree on the row after the gap and you know which one answers your question.",
          },
        },
      ],
    },
    {
      numeral: "III",
      title: "The ranking family",
      lessons: [
        {
          id: "l8",
          title: "ROW_NUMBER, RANK, and DENSE_RANK",
          summary: "Three functions that differ only in how they treat a tie.",
          minutes: 12,
          status: "set",
          body: [
            { kind: "p", text: "Three functions, and the only thing separating them is what they do when two rows tie. `row_number()` never ties: it picks one and moves on. `rank()` ties, then skips ahead so the next number reflects how many rows came before it. `dense_rank()` ties and carries straight on." },
            {
              kind: "sql",
              code: `select
  user_id,
  events,
  row_number() over w as rn,
  rank()       over w as rnk,
  dense_rank() over w as dense
from daily_events
window w as (order by events desc);`,
            },
            {
              kind: "table",
              head: ["EVENTS", "RN", "RNK", "DENSE"],
              rows: [
                ["44", "1", "1", "1"],
                ["31", "2", "2", "2"],
                ["31", "3", "2", "2"],
                ["12", "4", "4", "3"],
              ],
              caption: "Two rows tie at 31. Watch what each function does to the row after them.",
            },
            { kind: "p", text: "The row at 12 is fourth by `rank()` and third by `dense_rank()`. Neither is wrong; they answer different questions. `rank()` tells you how many rows beat this one. `dense_rank()` tells you how many distinct values beat it." },
            {
              kind: "note",
              title: "ROW_NUMBER is a coin toss on a tie",
              text: "Nothing in the standard says which of two tied rows gets 1 and which gets 2. Add a second ORDER BY column and the answer stops changing between runs.",
            },
          ],
          exercise: {
            task: "Run all three against `daily_events` ordered by `events desc`, on a day where at least two users tie. Write down which of the three your actual report wants, and why the other two would be wrong for it.",
            check: "Done when you can name the question each function answers, in one sentence each.",
          },
        },
        {
          id: "l9",
          title: "Top N rows per group",
          summary:
            "The pattern you will reach for more than any other in this course.",
          minutes: 13,
          status: "set",
          body: [
            { kind: "p", text: "This is the pattern you will reach for more than any other. Number the rows inside each group, then keep the low numbers. Two steps, because a window function cannot go in a `where` clause." },
            {
              kind: "sql",
              code: `with ranked as (
  select
    user_id,
    day,
    events,
    row_number() over (
      partition by user_id
      order by events desc
    ) as rn
  from daily_events
)
select user_id, day, events
from ranked
where rn <= 3;`,
            },
            { kind: "p", text: "The reason for the CTE is ordering, not style. `where` runs before window functions do, so at the moment the filter is evaluated `rn` does not exist yet. You compute it in one step and filter it in the next." },
            {
              kind: "note",
              title: "Ties change the row count",
              text: "With `row_number()` you get exactly three rows per user. Swap in `rank()` and a three-way tie for third gives you five. Pick the one whose row count you can defend.",
            },
          ],
          exercise: {
            task: "Write the top three busiest days per user against `daily_events`. Then change `row_number()` to `rank()` and count the rows again. Keep whichever one matches what you would tell someone the query returns.",
            check: "Done when the row counts differ and you can explain the difference without rerunning it.",
          },
        },
        {
          id: "l10",
          title: "Deduplicating without a self join",
          summary:
            "ROW_NUMBER over the key you wish were unique, then keep the first.",
          minutes: 10,
          status: "set",
          body: [
            { kind: "p", text: "Every table that was loaded twice has the same shape of problem: a key you wish were unique, and a pile of rows sharing it. The self join you were about to write is a `row_number()` in disguise." },
            {
              kind: "sql",
              code: `with numbered as (
  select
    ctid,
    user_id,
    day,
    row_number() over (
      partition by user_id, day
      order by loaded_at desc
    ) as rn
  from daily_events
)
select * from numbered where rn > 1;`,
            },
            { kind: "p", text: "Order the partition by whatever decides which copy wins — the newest load, the highest id, the row with the fewest nulls. Everything numbered above one is a duplicate by your own definition, and you can look at them before you delete anything." },
            {
              kind: "note",
              title: "Look first, delete second",
              text: "Select the rows above one and read them. A dedup that runs before you have seen what it matches is how a load bug becomes a data loss incident.",
            },
          ],
          exercise: {
            task: "Find the duplicates in `daily_events` on `(user_id, day)`. Do not delete them yet: select them, count them, and decide which copy you would keep and on what grounds.",
            check: "Done when you have the duplicate rows on screen and a stated rule for which one survives.",
          },
        },
        {
          id: "l11",
          title: "NTILE, and the buckets it gets wrong",
          summary:
            "Even-sized buckets, uneven data, and what NTILE does with the remainder.",
          minutes: 11,
          status: "set",
          body: [
            { kind: "p", text: "`ntile(n)` splits an ordered window into n buckets of as-equal-a-size as it can manage. Quartiles, deciles, and the usual reporting cuts fall straight out of it." },
            {
              kind: "sql",
              code: `select
  user_id,
  events,
  ntile(4) over (order by events desc) as quartile
from daily_events;`,
            },
            { kind: "p", text: "The catch is the remainder. Ten rows into four buckets is 3, 3, 2, 2 — the earlier buckets get the extra rows, and two rows with the identical value can land either side of a boundary. `ntile()` is counting rows, not reading values." },
            {
              kind: "note",
              title: "It buckets positions, not values",
              text: "If the boundary has to fall on a value rather than a row count, you want a comparison against a computed threshold, not NTILE.",
            },
          ],
          exercise: {
            task: "Bucket your users into quartiles by total events. Then find two users with the same total that landed in different quartiles, and decide whether that is acceptable for the report you are building.",
            check: "Done when you have either found such a pair or proved there is none in your data.",
          },
        },
        {
          id: "l12",
          title: "Ranking on a tie you did not expect",
          summary: "Why your top ten has eleven rows this week.",
          minutes: 9,
          status: "set",
          body: [
            { kind: "p", text: "Someone asks why the top ten has eleven rows in it this week. It has eleven rows because two of them tied for tenth, and `rank()` gave them both the number 10." },
            {
              kind: "sql",
              code: `with ranked as (
  select user_id, events,
         rank() over (order by events desc) as rnk
  from weekly_totals
)
select * from ranked where rnk <= 10;`,
            },
            { kind: "p", text: "This is not a bug in `rank()`. It is the question being underspecified: a top ten is either ten rows or the rows ranked ten and better, and those are different things the moment there is a tie. Decide which one the report means and say so in the query." },
            {
              kind: "note",
              title: "Say it in the query",
              text: "If you want exactly ten rows, use ROW_NUMBER and a deliberate tiebreaker. If you want everyone who earned tenth place, use RANK and let the count float.",
            },
          ],
          exercise: {
            task: "Take a ranking you already produce and find a week where it ties at the cutoff. Write both versions — the fixed-count one and the ties-included one — and pick the one you would defend to whoever reads the report.",
            check: "Done when both queries run and you have chosen between them on purpose.",
          },
        },
      ],
    },
    {
      numeral: "IV",
      title: "Looking forward and back",
      lessons: [
        {
          id: "l13",
          title: "LAG and LEAD",
          summary:
            "Reach the previous row and the next one without joining the table to itself.",
          minutes: 12,
          status: "set",
          body: [
            { kind: "p", text: "`lag()` reaches backwards to a previous row and `lead()` reaches forwards, both inside the window's ordering. This is the other half of what you used to do with a self join on `day = day - 1`, and it does not quietly drop rows when a day is missing." },
            {
              kind: "sql",
              code: `select
  user_id,
  day,
  events,
  lag(events)  over w as prev_day,
  lead(events) over w as next_day
from daily_events
window w as (partition by user_id order by day);`,
            },
            {
              kind: "table",
              head: ["DAY", "EVENTS", "PREV_DAY", "NEXT_DAY"],
              rows: [
                ["2026-08-03", "12", "", "31"],
                ["2026-08-04", "31", "12", "8"],
                ["2026-08-05", "8", "31", "44"],
                ["2026-08-06", "44", "8", ""],
              ],
              caption: "The first row has no previous and the last has no next, so both come back null.",
            },
            { kind: "p", text: "Both take an optional offset and default: `lag(events, 7, 0)` reaches a week back and returns zero instead of null at the edges. Reach for the default when null would poison the arithmetic downstream, and leave it out when the null is telling you something true." },
          ],
          exercise: {
            task: "Put each user's previous day beside their current one. Find the rows where `prev_day` is null and say, for each, whether that is a real edge of the data or a gap in it.",
            check: "Done when you can tell the two kinds of null apart in your own table.",
          },
        },
        {
          id: "l14",
          title: "Week over week, without a self join",
          summary:
            "Change, growth rate, and the arithmetic that hides a divide by zero.",
          minutes: 14,
          status: "set",
          body: [
            { kind: "p", text: "Change is the easy part: this week minus last week. The trouble is always the growth rate, because the denominator is a number you did not choose and sooner or later it is zero." },
            {
              kind: "sql",
              code: `select
  user_id,
  week,
  events,
  events - lag(events) over w as change,
  round(
    (events - lag(events) over w)::numeric
      / nullif(lag(events) over w, 0),
    3
  ) as growth
from weekly_totals
window w as (partition by user_id order by week);`,
            },
            { kind: "p", text: "`nullif` turns the zero into a null, and the division returns null instead of raising. That is the honest answer: a user who did nothing last week does not have a growth rate, and printing an arbitrary number in that cell would be inventing one." },
            {
              kind: "note",
              title: "Null is a result",
              text: "Coalescing that null to zero says growth was flat. It was not flat; it was undefined. Carry the null to the surface and let the report decide how to show it.",
            },
          ],
          exercise: {
            task: "Compute week over week change and growth for your usage table. Deliberately include a user whose first week is zero, and check what your query prints in that cell.",
            check: "Done when the zero-denominator row returns null rather than an error or a fabricated number.",
          },
        },
        {
          id: "l15",
          title: "FIRST_VALUE, LAST_VALUE, and the trap in the second one",
          summary:
            "Why LAST_VALUE keeps returning the current row until you fix its frame.",
          minutes: 12,
          status: "set",
          body: [
            { kind: "p", text: "`first_value()` does what you expect. `last_value()` almost never does, and the reason is the frame you did not write." },
            {
              kind: "sql",
              code: `select
  user_id,
  day,
  events,
  first_value(events) over w as first_day,
  last_value(events)  over w as looks_wrong
from daily_events
window w as (partition by user_id order by day);`,
            },
            { kind: "p", text: "`looks_wrong` comes back equal to `events` on every row. Once you add `order by` to a window, the default frame is everything from the start of the partition up to the current row — so the last row of the frame is the row you are standing on. `first_value()` survives that because the first row of the frame does not move." },
            {
              kind: "sql",
              code: `select
  user_id,
  day,
  last_value(events) over (
    partition by user_id
    order by day
    rows between unbounded preceding
             and unbounded following
  ) as last_day
from daily_events;`,
            },
            {
              kind: "note",
              title: "The fix is the frame, not the function",
              text: "Widen the frame to the whole partition and LAST_VALUE returns what its name promised. Nothing about the function was broken.",
            },
          ],
          exercise: {
            task: "Run LAST_VALUE without a frame clause and confirm it returns the current row. Then widen the frame and confirm it changes. Keep both queries side by side as a reminder.",
            check: "Done when you can point at the frame clause and say what each of its two bounds is doing.",
          },
        },
        {
          id: "l16",
          title: "Gaps and islands",
          summary:
            "Find consecutive streaks by subtracting a row number from a date.",
          minutes: 16,
          status: "set",
          body: [
            { kind: "p", text: "Streaks look like they need a loop and they do not. Subtract a row number from a date, and every run of consecutive days collapses to the same constant — because both sides are increasing by one." },
            {
              kind: "sql",
              code: `with marked as (
  select
    user_id,
    day,
    day - (row_number() over (
      partition by user_id order by day
    ))::int as island
  from active_days
)
select user_id, min(day) as started, max(day) as ended, count(*) as days
from marked
group by user_id, island
order by started;`,
            },
            {
              kind: "table",
              head: ["DAY", "RN", "ISLAND"],
              rows: [
                ["2026-08-03", "1", "2026-08-02"],
                ["2026-08-04", "2", "2026-08-02"],
                ["2026-08-06", "3", "2026-08-03"],
                ["2026-08-07", "4", "2026-08-03"],
              ],
              caption: "Two runs, two constants. The gap on the fifth is what moves the island value.",
            },
            { kind: "p", text: "Group by that constant and each island becomes one row with a start, an end and a length. The trick reads as arbitrary the first time and obvious the second; write it out by hand once and it stops being a thing you look up." },
          ],
          exercise: {
            task: "Find the longest run of consecutive active days for each user. Break one run deliberately by removing a day, and confirm the island count goes up by one.",
            check: "Done when the streak lengths change in the direction you expected after removing the day.",
          },
        },
      ],
    },
    {
      numeral: "V",
      title: "Making it fast and readable",
      lessons: [
        {
          id: "l17",
          title: "Naming windows with the WINDOW clause",
          summary:
            "Declare the window once, use it in six columns, stop repeating yourself.",
          minutes: 8,
          status: "set",
          body: [
            { kind: "p", text: "By this point you have written the same `partition by user_id order by day` four times in one select list. The `window` clause lets you name it once." },
            {
              kind: "sql",
              code: `select
  user_id,
  day,
  sum(events)   over w as running,
  avg(events)   over w as mean_so_far,
  lag(events)   over w as prev_day,
  row_number()  over w as n
from daily_events
window w as (partition by user_id order by day)
order by user_id, day;`,
            },
            { kind: "p", text: "It is not only shorter. A named window is one definition, so a change to the ordering cannot be applied to three of the four columns and forgotten on the fourth. You can also define several, and a window can extend another by name when only the frame differs." },
            {
              kind: "note",
              title: "Where it sits",
              text: "The WINDOW clause goes after HAVING and before ORDER BY. It is easy to miss because most queries never need it.",
            },
          ],
          exercise: {
            task: "Take a query of yours with a repeated OVER clause and collapse it to a named window. Change the ordering once and confirm every column moved with it.",
            check: "Done when the query is shorter and one edit reaches every column that should follow it.",
          },
        },
        {
          id: "l18",
          title: "Reading the plan: where the sort happens",
          summary:
            "One sort per distinct window, and how to get away with fewer.",
          minutes: 15,
          status: "set",
          body: [
            { kind: "p", text: "A window function needs its input sorted, so the planner puts a sort under it. Two windows that share a `partition by` and an `order by` share one sort. Two that do not need two, and the second one is the line in the plan you were not expecting." },
            {
              kind: "sql",
              code: `explain (analyze, costs off)
select
  user_id,
  sum(events) over (partition by user_id order by day),
  rank()      over (partition by day     order by events desc)
from daily_events;`,
            },
            { kind: "p", text: "Read the plan from the inside out and count the `Sort` nodes. Two different partitions, two sorts, and the whole table passing through both. Sometimes the fix is to accept it; sometimes it is to notice that the second window did not really need a different partition." },
            {
              kind: "note",
              title: "An index can remove one",
              text: "If a window's ordering matches an existing index, the planner can walk it instead of sorting. That is worth checking before you rewrite anything.",
            },
          ],
          exercise: {
            task: "Run EXPLAIN ANALYZE on a query with two differently partitioned windows. Count the sorts, then rewrite it so both windows share one, and compare the timings.",
            check: "Done when you have both plans and can say what the second sort was costing you.",
          },
        },
        {
          id: "l19",
          title: "When a window function is the wrong tool",
          summary:
            "Cases where a join, a lateral, or a materialised rollup wins outright.",
          minutes: 11,
          status: "set",
          body: [
            { kind: "p", text: "Window functions are not free, and there are questions where a plain join is faster, clearer, or both. Knowing where the tool stops is part of knowing the tool." },
            { kind: "p", text: "The three cases worth recognising: when you only want the aggregate and not the detail rows, `group by` is smaller and cheaper — a window that you immediately collapse was wasted work. When you need the top row per group over a very large table, a lateral join against an index can beat sorting the whole partition. And when the same computed column is read by many queries every day, the right answer is a materialised rollup, not recomputing the window each time." },
            {
              kind: "sql",
              code: `-- lateral: touches an index instead of sorting every partition
select u.user_id, d.day, d.events
from users u
cross join lateral (
  select day, events
  from daily_events e
  where e.user_id = u.user_id
  order by events desc
  limit 3
) d;`,
            },
            {
              kind: "note",
              title: "Measure before you switch",
              text: "All three of these are conditional on your data. The window version is usually the readable one, and readable wins until something is measurably too slow.",
            },
          ],
          exercise: {
            task: "Take the top-three-per-user query from Lesson 9 and write it again as a lateral join. Time both on your real table and keep the one that wins, not the one you expected to win.",
            check: "Done when you have two timings and have chosen on the numbers.",
          },
        },
        {
          id: "l20",
          title: "Your usage question, answered in one query",
          summary:
            "Assemble the whole course into the query you came here to write.",
          minutes: 20,
          status: "set",
          body: [
            { kind: "p", text: "This is the query you came here to write. Every piece of it is something you have already built: a partition per user, a running total, a rank, a comparison against the previous week, and a frame you chose on purpose." },
            {
              kind: "sql",
              code: `with weekly as (
  select
    user_id,
    date_trunc('week', day) as week,
    sum(events) as events
  from daily_events
  group by user_id, date_trunc('week', day)
),
shaped as (
  select
    user_id,
    week,
    events,
    sum(events)   over w as running_total,
    lag(events)   over w as prev_week,
    rank()        over (partition by week order by events desc) as rank_that_week
  from weekly
  window w as (partition by user_id order by week)
)
select
  user_id,
  week,
  events,
  running_total,
  events - prev_week as change,
  round(
    (events - prev_week)::numeric / nullif(prev_week, 0), 3
  ) as growth,
  rank_that_week
from shaped
where week >= date_trunc('week', current_date) - interval '8 weeks'
order by week desc, rank_that_week;`,
            },
            {
              kind: "table",
              head: ["USER_ID", "WEEK", "EVENTS", "CHANGE", "RANK"],
              rows: [
                ["ua_1041", "2026-08-24", "412", "+58", "1"],
                ["ua_2277", "2026-08-24", "266", "-31", "2"],
                ["ua_1041", "2026-08-17", "354", "+12", "1"],
                ["ua_2277", "2026-08-17", "297", "+44", "2"],
              ],
              caption: "Two windows, two partitions, one query, and no self join anywhere in it.",
            },
            { kind: "p", text: "Two things are worth noticing before you close this. The aggregate happens first, in its own CTE, so the windows run over weeks and not over days. And the two windows partition differently on purpose — one follows a user through time, the other ranks users against each other within a week. That is the whole course in one statement." },
            {
              kind: "note",
              title: "Now point it at your own table",
              text: "Swap `daily_events` for whatever you actually have. The shape holds; only the column names change.",
            },
          ],
          exercise: {
            task: "Rewrite this query against your own usage data and answer the question you had when you started this Course. Not a practice question — the real one.",
            check: "Done when you have the answer, without having asked anyone for it.",
          },
        },
      ],
    },
  ],
};

export const tutorThread: TutorTurn[] = [
  { from: "learner", text: "Is PARTITION BY just GROUP BY that does not collapse?" },
  {
    from: "tutor",
    text: "Close enough to be useful, wrong in one place. Both split rows by a key. GROUP BY then folds each group into one row and discards the rest; PARTITION BY leaves every row where it is. Where the analogy breaks: one SELECT can carry several different partitions, each with its own key. You only ever get one GROUP BY per query level.",
  },
  { from: "learner", text: "So why did adding a WHERE change my totals?" },
  {
    from: "tutor",
    text: "WHERE runs before the window does, so a filtered row is in no partition at all. The CTE in this Lesson is the fix: build the window column first, filter the result afterwards.",
  },
  { from: "learner", text: "Does the partition column have to be in the SELECT list?" },
  {
    from: "tutor",
    text: "No. `partition by account_id` works whether or not `account_id` appears in your output. Another difference from GROUP BY, where every non-aggregated column has to be grouped.",
  },
];

export const tailorPlan: TailorChange[] = [
  {
    id: "c1",
    verb: "add",
    entry: "After Lesson 7",
    detail: "EXCLUDE, and the frame clauses nobody writes",
    reason: "You asked for the frame material in more depth.",
  },
  {
    id: "c2",
    verb: "split",
    entry: "Lesson 12",
    detail: "Ties in RANK · Stable ordering for reports",
    reason: "Two separate ideas were sharing one entry.",
  },
  {
    id: "c3",
    verb: "move",
    entry: "Lesson 19",
    detail: "When a window function is the wrong tool → Module I, after Lesson 4",
    reason: "Reads better as a boundary on the tool than as a closing caveat.",
  },
  {
    id: "c4",
    verb: "add",
    entry: "After Lesson 14",
    detail: "A Lesson on percent change without a divide by zero",
    reason: "Your Goal is a usage question, and every usage question ends in a growth rate with a zero in the denominator.",
  },
  {
    id: "c5",
    verb: "move",
    entry: "Lesson 17",
    detail: "Naming windows with the WINDOW clause — earlier",
    reason: "You are repeating the same OVER clause from Lesson 9 onward. The fix should arrive before the repetition does.",
  },
  {
    id: "c6",
    verb: "split",
    entry: "Lesson 16",
    detail: "Separate the trick from the report it produces",
    reason: "Gaps and islands is one idea and one worked report. Sixteen minutes is doing two jobs.",
  },
];

/** The Tutor is not connected in this build. Shown verbatim, labelled. */
export const tutorPlaceholderReply =
  "The Tutor is not connected in this build. Your question would be answered here, grounded in the Lesson content plus web search, and it would never change the Course.";

export const addedFrames: Lesson = {
  id: "l7b",
  title: "EXCLUDE, and the frame clauses nobody writes",
  summary:
    "EXCLUDE CURRENT ROW, EXCLUDE TIES, and the two places they earn their keep.",
  minutes: 9,
  status: "set",
  body: [
    { kind: "p", text: "You have written `rows between` and `range between`. There is a third part to a frame that almost nobody writes, and twice a year it is exactly what you need: `exclude`." },
    {
      kind: "sql",
      code: `select
  user_id,
  day,
  events,
  avg(events) over (
    partition by user_id
    order by day
    rows between 3 preceding and 3 following
    exclude current row
  ) as neighbours_only
from daily_events;`,
    },
    { kind: "p", text: "`exclude current row` drops the row you are standing on from its own frame. That is how you ask whether today is unusual compared to the days around it, without today dragging the comparison toward itself. `exclude ties` drops the peers that tie with it under the window's ordering, and `exclude group` drops both." },
    {
      kind: "note",
      title: "The default is EXCLUDE NO OTHERS",
      text: "Which is why you have never had to write one. Everything you have built so far included the current row, and mostly that was right.",
    },
  ],
  exercise: {
    task: "Compute a seven-day average around each day with and without EXCLUDE CURRENT ROW. Find the day where the two differ most, and say why.",
    check: "Done when you can explain the biggest gap between the two columns.",
  },
};

export const splitTies: Lesson[] = [
  {
    id: "l12a",
    title: "Ties in RANK",
    summary: "What RANK does with a tie, and why the next number skips.",
    minutes: 7,
    status: "set",
    body: [
      { kind: "p", text: "A tie in `rank()` gives both rows the same number, and then the next row skips. Two rows tied at 2 means the row after them is 4, not 3. The gap is the point: rank tells you how many rows are ahead of this one." },
      {
        kind: "sql",
        code: `select
  user_id,
  events,
  rank() over (order by events desc) as rnk
from weekly_totals;`,
      },
      {
        kind: "table",
        head: ["EVENTS", "RNK"],
        rows: [
          ["412", "1"],
          ["266", "2"],
          ["266", "2"],
          ["198", "4"],
        ],
        caption: "Two rows at 266 share second place, so nothing is third.",
      },
      { kind: "p", text: "If the skip is what you want, you already have it. If the gap looks like a bug to whoever reads the report, you wanted `dense_rank()` — and that is a conversation about the report, not about the SQL." },
    ],
    exercise: {
      task: "Produce a ranking with a real tie in it. Show it to someone who has not read this Lesson and see whether the missing number reads as correct or as broken.",
      check: "Done when you have decided, with a reason, between RANK and DENSE_RANK for that report.",
    },
  },
  {
    id: "l12b",
    title: "Stable ordering for reports",
    summary:
      "Make the same query return the same order tomorrow, tie or no tie.",
    minutes: 8,
    status: "set",
    body: [
      { kind: "p", text: "The same query, the same data, a different order tomorrow. This happens when the window's `order by` does not fully determine the sequence, and the database is free to break the tie however it likes on the day." },
      {
        kind: "sql",
        code: `select
  user_id,
  events,
  row_number() over (
    order by events desc, user_id
  ) as rn
from weekly_totals;`,
      },
      { kind: "p", text: "Add a column that is unique — a key, an id, a created timestamp — as the last term of the ordering. It changes nothing about the ranking you care about and it makes the result reproducible, which is what anyone comparing two runs of the report is quietly assuming." },
      {
        kind: "note",
        title: "Order the outer query too",
        text: "A stable window does not give you a stable result set. Without an ORDER BY on the outermost select, the rows can still come back in any order.",
      },
    ],
    exercise: {
      task: "Run a ranking query twice and diff the two results. If they match, remove the tiebreaker column and try again on a table with ties until they do not.",
      check: "Done when you have seen the order move, and then made it stop.",
    },
  },
];

/** Entry numbers are positional. They renumber when the Tailor rearranges. */
export function numbered(modules: Module[]): NumberedLesson[] {
  let n = 0;
  return modules.flatMap((m) =>
    m.lessons.map((l) => ({
      ...l,
      n: ++n,
      moduleNumeral: m.numeral,
      moduleTitle: m.title,
    })),
  );
}
