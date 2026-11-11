import { prisma } from "./prisma";

export async function checkUserAcess(email: string) {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    include: {
      subscriptions: {
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) return false;
  const subscription = user.subscriptions[0];
  if (!subscription) return false;
  const now = new Date();
  if (subscription.endDate < now) return false;

  return true;
}
