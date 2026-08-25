import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

interface FeedEvent {
  uid: string;
  date: Date;
  summary: string;
  description: string;
}

const foldIcsLine = (line: string) => line.replace(/[\r\n]/g, " ");
const toIcsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

/**
 * A read-only ICS feed any calendar app (Google Calendar, Outlook, Apple Calendar) can subscribe
 * to by URL — no OAuth integration to build or maintain, at the cost of the client polling on its
 * own schedule rather than getting pushed updates.
 */
@Injectable()
export class CalendarFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async buildFeed(token: string): Promise<string> {
    const company = await this.prisma.company.findUnique({ where: { calendarFeedToken: token } });
    if (!company) throw new NotFoundException("Calendar feed not found");

    const [tasks, milestones, serviceVisits] = await Promise.all([
      this.prisma.task.findMany({
        where: { project: { companyId: company.id }, dueDate: { not: null } },
        include: { project: { select: { name: true } } },
      }),
      this.prisma.milestone.findMany({
        where: { project: { companyId: company.id }, dueDate: { not: null } },
        include: { project: { select: { name: true } } },
      }),
      this.prisma.serviceVisit.findMany({
        where: { companyId: company.id },
        include: { serviceContract: { select: { title: true } } },
      }),
    ]);

    const events: FeedEvent[] = [
      ...tasks.map((t) => ({
        uid: `task-${t.id}@cantero`,
        date: t.dueDate!,
        summary: `${t.project.name}: ${t.name}`,
        description: "Task due date",
      })),
      ...milestones.map((m) => ({
        uid: `milestone-${m.id}@cantero`,
        date: m.dueDate!,
        summary: `${m.project.name}: ${m.name} (milestone)`,
        description: "Project milestone",
      })),
      ...serviceVisits.map((v) => ({
        uid: `service-visit-${v.id}@cantero`,
        date: v.scheduledDate,
        summary: `Service visit: ${v.serviceContract.title}`,
        description: "Scheduled maintenance visit",
      })),
    ];

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cantero//Calendar Feed//EN",
      "CALSCALE:GREGORIAN",
      `X-WR-CALNAME:${foldIcsLine(company.name)} — Cantero`,
    ];
    for (const event of events) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${event.uid}`,
        `DTSTAMP:${toIcsDate(new Date())}`,
        `DTSTART:${toIcsDate(event.date)}`,
        `SUMMARY:${foldIcsLine(event.summary)}`,
        `DESCRIPTION:${foldIcsLine(event.description)}`,
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
}
