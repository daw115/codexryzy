"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

interface WeeklySummary {
  week: string;
  date_range: { start: string; end: string };
  stats: {
    tasks_due: number;
    tasks_high_priority: number;
    emails_analyzed: number;
    active_projects: number;
    urgent_deadlines: number;
  };
  urgent_tasks: Array<{
    title: string;
    due_at: string;
    priority: number;
  }>;
  next_week_preview: Array<{
    title: string;
    due_at: string;
    priority: number;
  }>;
  insights: string[];
}

function getWeekString(date: Date): string {
  const year = date.getFullYear();
  const start = new Date(year, 0, 1);
  const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${year}-W${week.toString().padStart(2, "0")}`;
}

export default function ReportsPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [report, setReport] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekString = getWeekString(currentDate);

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
          `${apiUrl}/v1/dashboard/weekly-summary?week=${weekString}`,
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
  }, [weekString]);

  const handlePreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleThisWeek = () => {
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
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Weekly Reports</h1>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handlePreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <h2 className="text-xl font-semibold">{report.week}</h2>
              <p className="text-sm text-muted-foreground">
                {report.date_range.start} → {report.date_range.end}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleThisWeek}>
              This Week
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Tasks Due</div>
              <div className="text-2xl font-bold">{report.stats.tasks_due}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">High Priority</div>
              <div className="text-2xl font-bold">{report.stats.tasks_high_priority}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Emails</div>
              <div className="text-2xl font-bold">{report.stats.emails_analyzed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Projects</div>
              <div className="text-2xl font-bold">{report.stats.active_projects}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Urgent</div>
              <div className="text-2xl font-bold text-red-600">{report.stats.urgent_deadlines}</div>
            </CardContent>
          </Card>
        </div>

        {/* Insights */}
        {report.insights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>📊 Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.insights.map((insight, idx) => (
                  <div key={idx} className="p-2 border rounded text-sm">
                    {insight}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Urgent Tasks */}
        {report.urgent_tasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>🚨 Urgent Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.urgent_tasks.map((task, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">URGENT</Badge>
                      <span className="text-sm">{task.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{task.due_at}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Next Week Preview */}
        {report.next_week_preview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>📅 Next Week Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {report.next_week_preview.map((task, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm">{task.title}</span>
                    <span className="text-xs text-muted-foreground">{task.due_at}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
