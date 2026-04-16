"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

interface DailyReport {
  date: string;
  day_of_week: string;
  emails: {
    total: number;
    by_category: Record<string, number>;
    highlights: Array<{
      id: string;
      title: string;
      summary: string;
      category: string;
    }>;
  };
  tasks: {
    completed: Array<{ id: string; title: string; priority: number }>;
    in_progress: Array<{ id: string; title: string; priority: number }>;
    overdue: Array<{ id: string; title: string; priority: number; due_at: string }>;
  };
  upcoming: {
    next_3_days: Array<{ id: string; title: string; due_at: string }>;
    next_7_days_deadlines: Array<{ id: string; title: string; priority: number; due_at: string }>;
  };
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function DailyReportsPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateString = currentDate.toISOString().split("T")[0];

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      setError(null);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_WORK_ASSISTANT_API_URL;
        const apiKey = process.env.NEXT_PUBLIC_WORK_ASSISTANT_API_KEY;

        if (!apiUrl || !apiKey) {
          throw new Error("API configuration missing");
        }

        const response = await fetch(
          `${apiUrl}/v1/dashboard/daily-report?date=${dateString}`,
          {
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, [dateString]);

  const handlePreviousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-500">Error: {error || "No data"}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Daily Reports</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Date Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handlePreviousDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <h2 className="text-xl font-semibold">{formatDate(report.date)}</h2>
              <p className="text-sm text-muted-foreground">{report.day_of_week}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleNextDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
          </div>
        </div>

        {/* Emails Summary */}
        <Card>
          <CardHeader>
            <CardTitle>📧 Emails Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total emails</span>
                <span className="text-2xl font-bold">{report.emails.total}</span>
              </div>

              {Object.keys(report.emails.by_category).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">By Category</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.emails.by_category).map(([category, count]) => (
                      <Badge key={category} variant="outline">
                        {category}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {report.emails.highlights.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Highlights</p>
                  <div className="space-y-2">
                    {report.emails.highlights.map((email) => (
                      <div key={email.id} className="p-2 border rounded text-sm">
                        <p className="font-medium">{email.title}</p>
                        {email.summary && (
                          <p className="text-muted-foreground text-xs mt-1">{email.summary}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card>
          <CardHeader>
            <CardTitle>✅ Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.tasks.completed.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Completed Today ({report.tasks.completed.length})
                  </p>
                  <div className="space-y-2">
                    {report.tasks.completed.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 p-2 border rounded">
                        <span className="text-green-600">✓</span>
                        <span className="text-sm">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.tasks.in_progress.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    In Progress ({report.tasks.in_progress.length})
                  </p>
                  <div className="space-y-2">
                    {report.tasks.in_progress.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 p-2 border rounded">
                        <Badge variant="default">In Progress</Badge>
                        <span className="text-sm">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.tasks.overdue.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 text-red-600">
                    Overdue ({report.tasks.overdue.length})
                  </p>
                  <div className="space-y-2">
                    {report.tasks.overdue.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 p-2 border rounded border-red-200"
                      >
                        <Badge variant="destructive">Overdue</Badge>
                        <span className="text-sm">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming */}
        <Card>
          <CardHeader>
            <CardTitle>📅 Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.upcoming.next_3_days.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Next 3 Days</p>
                  <div className="space-y-2">
                    {report.upcoming.next_3_days.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <span className="text-sm">{task.title}</span>
                        {task.due_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(task.due_at).toLocaleDateString("pl-PL")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.upcoming.next_7_days_deadlines.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Important Deadlines (Next 7 Days)</p>
                  <div className="space-y-2">
                    {report.upcoming.next_7_days_deadlines.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant={task.priority === 1 ? "destructive" : "default"}>
                            {task.priority === 1 ? "URGENT" : "HIGH"}
                          </Badge>
                          <span className="text-sm">{task.title}</span>
                        </div>
                        {task.due_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(task.due_at).toLocaleDateString("pl-PL")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
