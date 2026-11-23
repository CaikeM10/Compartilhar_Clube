import { requirePageAccess } from "@/lib/auth/page-access";
import { Card } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/admin/user-validation";

export const dynamic = "force-dynamic";

/** The only protected page reachable while an initial password is pending; also usable for a voluntary change. */
export default async function AlterarSenhaPage() {
  const { user } = await requirePageAccess("password-change");
  const minimum = user.role === "ADMIN" ? PASSWORD_MIN.admin : PASSWORD_MIN.student;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary to-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-accent">
              <span className="text-3xl font-bold text-primary">CC</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white font-display">
            {user.mustChangePassword ? "Defina sua senha" : "Alterar senha"}
          </h1>
          <p className="text-white/80 mt-2">
            {user.mustChangePassword
              ? "Por segurança, troque a senha inicial antes de acessar a plataforma."
              : "Escolha uma nova senha para sua conta."}
          </p>
        </div>
        <Card className="p-8">
          <ChangePasswordForm minimum={minimum} maximum={PASSWORD_MAX} required={user.mustChangePassword} />
        </Card>
      </div>
    </div>
  );
}
