"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format-date";

interface TrainingCourse {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  validityMonths: number | null;
  _count: { enrollments: number };
}
interface Worker {
  id: string;
  name: string;
}
interface Enrollment {
  id: string;
  status: "enrolled" | "completed";
  worker: { id: string; name: string };
  completedAt: string | null;
}
interface ComplianceGap {
  courseId: string;
  courseTitle: string;
  totalActiveWorkers: number;
  missingWorkers: { workerId: string; workerName: string }[];
}

export function TrainingCatalogPanel() {
  const t = useTranslations("training");
  const tc = useTranslations("common");

  const [courses, setCourses] = useState<TrainingCourse[] | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [gaps, setGaps] = useState<ComplianceGap[] | null>(null);
  const [form, setForm] = useState({ title: "", category: "", validityMonths: "" });
  const [busy, setBusy] = useState(false);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [enrollWorkerId, setEnrollWorkerId] = useState("");

  function load() {
    apiFetch<TrainingCourse[]>("/training/courses").then(setCourses);
    apiFetch<ComplianceGap[]>("/training/compliance-gaps").then(setGaps);
  }

  useEffect(() => {
    load();
    apiFetch<Worker[]>("/workers").then(setWorkers);
  }, []);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/training/courses", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category.trim() || undefined,
          validityMonths: form.validityMonths ? Number(form.validityMonths) : undefined,
        }),
      });
      setForm({ title: "", category: "", validityMonths: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/training/courses/${id}`, { method: "DELETE" });
      if (expandedCourseId === id) setExpandedCourseId(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpand(courseId: string) {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
      return;
    }
    setExpandedCourseId(courseId);
    setEnrollments(null);
    const list = await apiFetch<Enrollment[]>(`/training/courses/${courseId}/enrollments`);
    setEnrollments(list);
    if (workers[0]) setEnrollWorkerId(workers[0].id);
  }

  async function enroll(courseId: string) {
    if (!enrollWorkerId) return;
    setBusy(true);
    try {
      await apiFetch(`/training/courses/${courseId}/enrollments`, { method: "POST", body: JSON.stringify({ workerId: enrollWorkerId }) });
      const list = await apiFetch<Enrollment[]>(`/training/courses/${courseId}/enrollments`);
      setEnrollments(list);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function complete(enrollmentId: string, courseId: string) {
    setBusy(true);
    try {
      await apiFetch(`/training/enrollments/${enrollmentId}/complete`, { method: "POST", body: JSON.stringify({}) });
      const list = await apiFetch<Enrollment[]>(`/training/courses/${courseId}/enrollments`);
      setEnrollments(list);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{t("catalogTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("catalogHint")}</p>

      <form onSubmit={createCourse} className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <input
          required
          placeholder={t("courseTitlePlaceholder")}
          className="input"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          placeholder={t("categoryPlaceholder")}
          className="input"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        />
        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
          {t("validityMonths")}
          <input
            type="number"
            min="1"
            max="120"
            className="input w-32"
            value={form.validityMonths}
            onChange={(e) => setForm((f) => ({ ...f, validityMonths: e.target.value }))}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {t("addCourse")}
        </button>
      </form>

      {courses === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{tc("loading")}</p>
      ) : courses.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{t("noCourses")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {courses.map((course) => {
            const gap = gaps?.find((g) => g.courseId === course.id);
            return (
              <li key={course.id} className="card">
                <div className="flex items-center justify-between">
                  <button onClick={() => toggleExpand(course.id)} className="text-left text-sm font-medium text-gray-900 dark:text-gray-50 hover:underline">
                    {course.title}
                  </button>
                  <div className="flex items-center gap-2">
                    {course.validityMonths && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{t("validForMonths", { months: course.validityMonths })}</span>
                    )}
                    <button onClick={() => deleteCourse(course.id)} disabled={busy} className="text-xs text-error-700 dark:text-error-500 hover:underline">
                      {tc("delete")}
                    </button>
                  </div>
                </div>
                {course.category && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{course.category}</p>}
                {gap && gap.missingWorkers.length > 0 && (
                  <p className="mt-1 text-xs text-warning-700 dark:text-warning-500">
                    {t("missingCount", { count: gap.missingWorkers.length, total: gap.totalActiveWorkers })}
                  </p>
                )}

                {expandedCourseId === course.id && (
                  <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <div className="mb-2 flex gap-2">
                      <select className="input" value={enrollWorkerId} onChange={(e) => setEnrollWorkerId(e.target.value)}>
                        {workers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => enroll(course.id)} disabled={busy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                        {t("enrollWorker")}
                      </button>
                    </div>
                    {!enrollments ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500">{tc("loading")}</p>
                    ) : enrollments.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500">{t("noEnrollments")}</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {enrollments.map((en) => (
                          <li key={en.id} className="flex items-center justify-between text-xs">
                            <span>{en.worker.name}</span>
                            {en.status === "completed" ? (
                              <span className="rounded-full bg-success-50 dark:bg-success-500/15 px-2 py-0.5 font-medium text-success-700 dark:text-success-500">
                                {t("completedOn", { date: en.completedAt ? formatDate(new Date(en.completedAt)) : "" })}
                              </span>
                            ) : (
                              <button onClick={() => complete(en.id, course.id)} disabled={busy} className="text-brand-600 hover:underline">
                                {t("markComplete")}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
