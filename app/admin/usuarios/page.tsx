import { AdminLayout } from "@/components/layout/AdminLayout";
import { requirePageAccess } from "@/lib/auth/page-access";
import { getAdminUsers } from "@/lib/admin/users";
import { Card } from "@/components/ui/card";
import { Users, Mail, Shield, User, Ban } from "lucide-react";

export default async function AdminUsuariosPage() {
  const { user } = await requirePageAccess("admin");
  const result = await getAdminUsers();

  return (
    <>
      <AdminLayout viewer={user}>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 font-display">
              Usuários
            </h1>
            <p className="text-muted-foreground text-lg">
              Visualize os membros da plataforma
            </p>
          </div>

          {result.kind === "unavailable" ? (
            <Card className="gap-3 p-6 border-primary/20" role="status">
              <h2 className="font-semibold text-primary">Lista indisponível no momento</h2>
              <p className="text-sm text-muted-foreground">
                Não foi possível consultar os usuários agora. Tente novamente em instantes.
              </p>
              <a href="/admin/usuarios" className="text-primary underline underline-offset-4">
                Tentar novamente
              </a>
            </Card>
          ) : (
            <>
              {/* Stats */}
              <Card className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-primary mb-1">
                    {result.users.length}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total de usuários cadastrados
                  </p>
                </div>
                <Users className="w-12 h-12 text-primary/20" />
              </Card>

              {/* Users List */}
              {result.users.length === 0 ? (
                <Card className="p-6" role="status">
                  <p className="text-muted-foreground">Nenhum usuário cadastrado.</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {result.users.map((usuario) => (
                    <Card
                      key={usuario.id}
                      className={`p-6 ${usuario.disabled ? "opacity-70" : ""}`}
                    >
                      <div className="flex items-start sm:items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-semibold text-primary uppercase">
                            {(usuario.name ?? usuario.email).charAt(0)}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                            {usuario.name ? (
                              <h3 className="font-semibold text-foreground break-words">
                                {usuario.name}
                              </h3>
                            ) : (
                              <h3 className="font-semibold italic text-muted-foreground">
                                Sem nome
                              </h3>
                            )}
                            {usuario.role === "admin" ? (
                              <span className="inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full text-xs font-medium text-primary">
                                <Shield className="w-3 h-3" />
                                Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground">
                                <User className="w-3 h-3" />
                                Aluno
                              </span>
                            )}
                            {usuario.disabled && (
                              <span className="inline-flex items-center gap-1 bg-[#b55239]/10 px-2 py-0.5 rounded-full text-xs font-medium text-[#b55239]">
                                <Ban className="w-3 h-3" />
                                Desativado
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1 min-w-0">
                              <Mail className="w-4 h-4 flex-shrink-0" />
                              <span className="break-all">{usuario.email}</span>
                            </span>
                            <span>
                              Membro desde{" "}
                              {new Date(usuario.createdAt).toLocaleDateString("pt-BR", {
                                timeZone: "America/Sao_Paulo",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
