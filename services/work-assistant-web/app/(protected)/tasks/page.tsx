import { TaskAdvisor } from "@/components/task-advisor";
import { getTaskSchedule } from "@/lib/api";
import { formatDate, priorityLabel } from "@/lib/format";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const schedule = await getTaskSchedule(7, 250);
  const openTasks = [
    ...schedule.overdue,
    ...schedule.today,
    ...schedule.next_7_days,
    ...schedule.later,
    ...schedule.unscheduled,
  ];
  const overdueTasks = schedule.overdue;
  const upcomingTasks = [...schedule.today, ...schedule.next_7_days];
  const noDueDate = schedule.unscheduled.length;

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Task execution</span>
            <h1 className="pageTitleCompact">Zadania, terminy i plan wykonania od AI</h1>
          </div>
          <div className="heroChipRow">
            <span className="pageTag">
              <strong>{openTasks.length}</strong> otwartych
            </span>
            <span className="pageTag">
              <strong>{overdueTasks.length}</strong> zaleglych
            </span>
            <span className="pageTag">
              <strong>{upcomingTasks.length}</strong> w 7 dni
            </span>
          </div>
        </div>
        <p className="sectionBodyCopy">
          Ten modul ma prowadzic do wykonania pracy. Najpierw widzisz terminy i zaleglosci, a
          potem AI moze rozpisac jak zrobic wybrane zadanie na podstawie maili i dokumentow.
        </p>
      </section>

      <section className="statsGrid">
        <StatCard
          eyebrow="Otwarte"
          value={String(openTasks.length)}
          detail="calkowity stan lokalnego mirrora"
          accent="gold"
        />
        <StatCard
          eyebrow="Zalegle"
          value={String(overdueTasks.length)}
          detail="taski po terminie"
          accent="ember"
        />
        <StatCard
          eyebrow="7 dni"
          value={String(upcomingTasks.length)}
          detail="rzeczy wpadajace w biezacy horyzont"
          accent="teal"
        />
        <StatCard
          eyebrow="Bez terminu"
          value={String(noDueDate)}
          detail="otwarte bez due date"
          accent="ink"
        />
      </section>

      <section className="doubleGrid">
        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Overdue</span>
              <h2 className="sectionTitle">Zalegle</h2>
            </div>
          </div>
          {overdueTasks.length ? (
            <div className="signalList">
              {overdueTasks.map((task) => (
                <article className="listCard" key={task.external_task_id}>
                  <div className="listCardHeader">
                    <h3 className="listCardTitle">{task.title}</h3>
                    <span className="priorityPill priority-high">{priorityLabel(task.priority)}</span>
                  </div>
                  <p className="listCardCopy">Termin: {formatDate(task.due_at)}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyState">Brak zaleglych zadan.</div>
          )}
        </article>

        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Upcoming</span>
              <h2 className="sectionTitle">Najblizsze 7 dni</h2>
            </div>
          </div>
          {upcomingTasks.length ? (
            <div className="signalList">
              {upcomingTasks.map((task) => (
                <article className="listCard" key={task.external_task_id}>
                  <div className="listCardHeader">
                    <h3 className="listCardTitle">{task.title}</h3>
                    <span className="statusPill">{task.project_id ?? "bez projektu"}</span>
                  </div>
                  <p className="listCardCopy">Termin: {formatDate(task.due_at)}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="emptyState">Brak zadan z terminem w najblizszym tygodniu.</div>
          )}
        </article>

        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Mirror</span>
              <h2 className="sectionTitle">Caly otwarty stan</h2>
            </div>
          </div>
          <div className="calloutCard">
            <strong>{openTasks.length} taskow w lokalnym mirrorze</strong>
            <p className="sectionBodyCopy">
              Ten ekran ma pomoc Ci decydowac, a nie zastepowac Vikunja. Jesli tu cos wyglada
              dziwnie, to znaczy, ze sync albo klasyfikacja wymagaja uwagi.
            </p>
          </div>
        </article>

        <TaskAdvisor tasks={openTasks.slice(0, 20)} />
      </section>

      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Open task list</span>
            <h2 className="sectionTitle">Otwarte zadania</h2>
          </div>
          <div className="sectionNote">top 50 wedlug terminu</div>
        </div>

        <table className="dataTable">
          <thead>
            <tr>
              <th>Tytuł</th>
              <th>Termin</th>
              <th>Priorytet</th>
              <th>Projekt</th>
            </tr>
          </thead>
          <tbody>
            {openTasks.slice(0, 50).map((task) => (
              <tr key={task.external_task_id}>
                <td>
                  <strong>{task.title}</strong>
                  <span className="mutedText">{task.description ?? "Brak opisu"}</span>
                </td>
                <td>{formatDate(task.due_at)}</td>
                <td>{priorityLabel(task.priority)}</td>
                <td>{task.project_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
