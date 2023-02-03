import dayjs from "dayjs";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./lib/prisma";

export async function appRoutes(app: FastifyInstance) {
  app.post("/habits", async (request) => {
    const createHabitBody = z.object({
      title: z.string(),
      weekDays: z.array(z.number().min(0).max(6)),
      user_id: z.string()
    });

    const { title, weekDays, user_id } = createHabitBody.parse(request.body);

    const today = dayjs().startOf("day").toDate();

    await prisma.habit.create({
      data: {
        title,
        created_at: today,
        user_id,
        weekDays: {
          create: weekDays.map((weekDay) => {
            return {
              week_day: weekDay
            };
          })
        }
      }
    });
  });

  app.get("/day", async (request) => {
    const getDayParams = z.object({
      date: z.coerce.date(),
      user_id: z.string()
    });

    const { date, user_id } = getDayParams.parse(request.query);

    const parsedDate = dayjs(date).startOf("day");
    const weekDay = parsedDate.get("day");

    const possibleHabits = await prisma.habit.findMany({
      where: {
        created_at: {
          lte: date
        },
        weekDays: {
          some: {
            week_day: weekDay
          }
        }
      }
    });

    const day = await prisma.day.findFirst({
      where: {
        date: parsedDate.toDate(),
        dayHabits: {
          every: {
            user_id
          }
        }
      },
      include: {
        dayHabits: true
      }
    });

    const completedHabits =
      day?.dayHabits.map((dayHabit) => {
        return dayHabit.habit_id;
      }) ?? [];

    return {
      possibleHabits,
      completedHabits
    };
  });

  app.patch("/habits/:id/toggle/:user_id", async (request) => {
    const toggleHabitParams = z.object({
      id: z.string().uuid(),
      user_id: z.string()
    });

    const { id, user_id } = toggleHabitParams.parse(request.params);

    const today = dayjs().startOf("day").toDate();

    let day = await prisma.day.findUnique({
      where: {
        date: today
      }
    });

    if (!day) {
      day = await prisma.day.create({
        data: {
          date: today
        }
      });
    }

    const dayHabit = await prisma.dayHabit.findUnique({
      where: {
        day_id_habit_id_user_id: {
          day_id: day.id,
          habit_id: id,
          user_id
        }
      }
    });

    if (dayHabit) {
      await prisma.dayHabit.delete({
        where: {
          id: dayHabit.id
        }
      });
    } else {
      await prisma.dayHabit.create({
        data: {
          day_id: day.id,
          habit_id: id,
          user_id
        }
      });
    }
  });

  app.get("/summary", async () => {
    const summary = await prisma.$queryRaw`
      SELECT 
        D.id, 
        D.date,
        (
          SELECT 
            cast(count(*) as float)
          FROM day_habits DH
          WHERE DH.day_id = D.id
          AND  DH.user_id = "Vt3cnOt2yJV2FFxfBzvkuE325sj1"
        ) as completed,
        (
          SELECT
            cast(count(*) as float)
          FROM habit_week_days HDW
          JOIN habits H
            ON H.id = HDW.habit_id
          WHERE
            HDW.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch') as int)
            AND H.created_at <= D.date AND H.user_id = "Vt3cnOt2yJV2FFxfBzvkuE325sj1"
        ) as amount
      FROM days D 
      INNER JOIN day_habits DH on DH.day_id = D.id  
      WHERE DH.user_id = "Vt3cnOt2yJV2FFxfBzvkuE325sj1" 
      GROUP BY d.id
    `;

    return summary;
  });
}
