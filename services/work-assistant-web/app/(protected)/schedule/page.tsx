import { TaskAdvisor } from "@/components/task-advisor";
import { getTaskSchedule } from "@/lib/api";
import { formatDate, priorityLabel } from "@/lib/format";
import type { TaskListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type TaskBucket = {
  label: string;
  note: string;
  tasks: TaskListItem[];
};

export default async function SchedulePage() {
  const schedule = await getTaskSchedule(7, 200);
  const overdue = schedule.overdue;
  const todayTasks = schedule.today;
  const upcoming = schedule.next_7_days;
  const later = schedule.later;
  const unscheduled = schedule.unscheduled;
  const orderedTasks = [...overdue, ...todayTasks, ...upcoming, ...later, ...unscheduled];

  const buckets: TaskBucket[] = [
    { label: "Zalegle", note: "najpierw to", tasks: overdue },
    { label: "Dzis", note: "biezacy dzien", tasks: todayTasks },
    { label: "Najblizsze 7 dni", note: "kolejny horyzont", tasks: upcoming },
    { label: "Pozniej", note: "po tym tygodniu", tasks: later },
    { label: "Bez terminu", note: "wymaga porzadku", tasks: unscheduled },
  ];

  return (
    <>
      <section className="sectionCard">
        <div className="sectionHeader">
          <div>
            <span className="sectionEyebrow">Kalendarz wykonania</span>
            <h1 className="pageTitleCompact">Kolejnosc pracy z deadlinow i maili</h1>
          </div>
          <div className="heroChipRow">
            <span className="pageTag">
              <strong>{overdue.length}</strong> zaleglych
            </span>
            <span className="pageTag">
              <strong>{todayTasks.length}</strong> dzis
            </span>
            <span className="pageTag">
              <strong>{upcoming.length}</strong> w 7 dni
            </span>
          </div>
        </div>
        <p className="sectionBodyCopy">
          Ten modul uklada prace po kolei. Deadline'y wyciagniete z maili i mirror taskow trafiaja
          do jednej osi, z ktorej AI moze budowac plan wykonania.
        </p>
      </section>

      <section className="doubleGrid">
        <article className="sectionCard">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">Execution timeline</span>
              <h2 className="sectionTitle">Co po kolei</h2>
            </div>
            <div className="sectionNote">{orderedTasks.length} taskow w osi czasu</div>
          </div>

          <div className="timelineList">
            {buckets.map((bucket) => (
              <div className="timelineGroup" key={bucket.label}>
                <div className="sectionHeader">
                  <div>
                    <h3 className="sectionTitle sectionTitleSmall">{bucket.label}</h3>
                    <p className="sectionNote">{bucket.note}</p>
                  </div>
                  <span className="statusPill">{bucket.tasks.length}</span>
                </div>
                {bucket.tasks.length ? (
                  bucket.tasks.map((task) => (
                    <article className="timelineItem" key={task.external_task_id}>
                      <div className="timelineMarker" />
                      <div className="timelineContent">
                        <div className="listCardHeader">
                          <h4 className="listCardTitle">{task.title}</h4>
                          <span className="priorityPill">{priorityLabel(task.priority)}</span>
                        </div>
                        <div className="timelineMeta">
                          <span>{formatDate(task.due_at, "bez terminu")}</span>
                          <span>{task.project_id ?? "bez projektu"}</span>
                          <span>{task.status}</span>
                        </div>
                        {task.description ? <p className="listCardCopy">{task.description}</p> : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="emptyState">Brak pozycji w tej sekcji.</div>
                )}
              </div>
            ))}
          </div>
        </article>

        <TaskAdvisor tasks={orderedTasks.slice(0, 20)} />
      </section>
    </>
  );
}
