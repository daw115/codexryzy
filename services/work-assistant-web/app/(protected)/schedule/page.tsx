import { TaskAdvisor } from "@/components/task-advisor";
import { getTaskSchedule } from "@/lib/api";
import { formatDate, priorityLabel } from "@/lib/format";
<<<<<<< HEAD
=======
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertTriangle, Clock, CalendarOff, CalendarDays } from "lucide-react";
>>>>>>> origin/main
import type { TaskListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

<<<<<<< HEAD
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
=======
type TaskBucket = { label: string; note: string; tasks: TaskListItem[]; icon: React.ElementType; color: string };

export default async function SchedulePage() {
  const schedule = await getTaskSchedule(7, 200);
  const orderedTasks = [
    ...schedule.overdue,
    ...schedule.today,
    ...schedule.next_7_days,
    ...schedule.later,
    ...schedule.unscheduled,
  ];

  const buckets: TaskBucket[] = [
    { label: "Zaległe", note: "najpierw to", tasks: schedule.overdue, icon: AlertTriangle, color: "text-destructive" },
    { label: "Dziś", note: "bieżący dzień", tasks: schedule.today, icon: Clock, color: "text-primary" },
    { label: "Najbliższe 7 dni", note: "kolejny horyzont", tasks: schedule.next_7_days, icon: Calendar, color: "text-info" },
    { label: "Później", note: "po tym tygodniu", tasks: schedule.later, icon: CalendarDays, color: "text-muted-foreground" },
    { label: "Bez terminu", note: "wymaga porządku", tasks: schedule.unscheduled, icon: CalendarOff, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-info" />
          Kalendarz
        </h1>
        <p className="text-muted-foreground mt-1">
          Kolejność pracy z deadlinów i maili · {orderedTasks.length} zadań
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-6">
          {buckets.map((bucket) => (
            <div key={bucket.label}>
              <div className="flex items-center gap-2 mb-3">
                <bucket.icon className={`h-4 w-4 ${bucket.color}`} />
                <h2 className={`text-sm font-semibold ${bucket.color}`}>{bucket.label}</h2>
                <Badge variant="secondary" className="text-xs">{bucket.tasks.length}</Badge>
                <span className="text-xs text-muted-foreground">· {bucket.note}</span>
              </div>

              {bucket.tasks.length > 0 ? (
                <div className="space-y-2 ml-6 border-l-2 border-border pl-4">
                  {bucket.tasks.map((task) => (
                    <Card key={task.external_task_id} className="bg-card border-border">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(task.due_at, "bez terminu")} · {task.project_id ?? "bez projektu"}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {priorityLabel(task.priority)}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground ml-6 pl-4">Brak zadań</p>
              )}
            </div>
          ))}
        </div>

        {/* AI Advisor */}
        <div>
          <TaskAdvisor tasks={orderedTasks.slice(0, 20)} />
        </div>
      </div>
    </div>
>>>>>>> origin/main
  );
}
