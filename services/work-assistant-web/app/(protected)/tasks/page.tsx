import { TaskAdvisor } from "@/components/task-advisor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getTaskSchedule } from "@/lib/api";
import { formatDate, priorityLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckSquare, AlertTriangle, Calendar, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

function priorityVariant(priority: number | null): "default" | "destructive" | "secondary" | "outline" {
  if (priority !== null && priority >= 3) return "destructive";
  if (priority !== null && priority === 2) return "default";
  return "secondary";
}

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

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-info" />
          Zadania
        </h1>
        <p className="text-muted-foreground mt-1">Zarządzanie zadaniami i plan wykonania AI</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Otwarte", value: openTasks.length, icon: CheckSquare, color: "text-info" },
          { label: "Zaległe", value: overdueTasks.length, icon: AlertTriangle, color: "text-destructive" },
          { label: "7 dni", value: upcomingTasks.length, icon: Calendar, color: "text-primary" },
          { label: "Bez terminu", value: schedule.unscheduled.length, icon: Clock, color: "text-muted-foreground" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task list */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="overdue">
            <TabsList>
              <TabsTrigger value="overdue">
                Zaległe ({overdueTasks.length})
              </TabsTrigger>
              <TabsTrigger value="upcoming">
                7 dni ({upcomingTasks.length})
              </TabsTrigger>
              <TabsTrigger value="all">
                Wszystkie ({openTasks.length})
              </TabsTrigger>
            </TabsList>

            {[
              { value: "overdue", tasks: overdueTasks },
              { value: "upcoming", tasks: upcomingTasks },
              { value: "all", tasks: openTasks.slice(0, 50) },
            ].map(({ value, tasks }) => (
              <TabsContent key={value} value={value} className="space-y-2 mt-4">
                {tasks.length === 0 ? (
                  <Card className="bg-card border-border">
                    <CardContent className="p-8 text-center text-muted-foreground text-sm">
                      Brak zadań w tej kategorii
                    </CardContent>
                  </Card>
                ) : (
                  tasks.map((task) => (
                    <Card
                      key={task.external_task_id}
                      className="bg-card border-border hover:border-primary/30 transition-colors"
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {task.due_at && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(task.due_at)}
                              </span>
                            )}
                            {task.project_id && (
                              <span className="text-xs text-muted-foreground">{task.project_id}</span>
                            )}
                          </div>
                        </div>
                        <Badge variant={priorityVariant(task.priority)} className="text-xs shrink-0">
                          {priorityLabel(task.priority)}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* AI Advisor */}
        <div>
          <TaskAdvisor tasks={openTasks.slice(0, 20)} />
        </div>
      </div>
    </div>
  );
}
