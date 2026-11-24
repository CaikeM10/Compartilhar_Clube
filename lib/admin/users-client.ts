import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, type RequestedRole } from "./user-validation";
import { addDays, fortalezaDay, grantPeriod, inclusiveDays, MANUAL_ACCESS_MAX_DAYS } from "./manual-access-rules";

// Client-side helpers for the users panel. Convenience only: every rule is enforced again by the server.

export class UserFormError extends Error {}

export type NewUserValues = {
  name: string; email: string; role: RequestedRole; password: string; confirmation: string;
  /** Optional manual access for a new student (inclusive Fortaleza days, YYYY-MM-DD). */
  grantAccess?: boolean; accessStart?: string; accessEnd?: string;
};

export const ACCESS_PERIOD_MESSAGE =
  `Informe um período válido: início a partir de hoje e duração de no máximo ${MANUAL_ACCESS_MAX_DAYS} dias.`;

/** Default form values: from today (Fortaleza) for 30 days, inclusive. */
export function defaultAccessPeriod(at = new Date()) {
  const start = fortalezaDay(at);
  return { start, end: addDays(start, 29) };
}

/** Latest last day allowed for a period starting on `start` (same rule the server applies). */
export function latestAccessEnd(start: string) {
  return addDays(start, MANUAL_ACCESS_MAX_DAYS - 1);
}

/** Convenience check before sending; the server validates again with its own clock. */
export function accessPeriodDays(start: string, end: string, at = new Date()) {
  return grantPeriod(start, end, at) ? inclusiveDays(start, end) : null;
}

export function buildCreateUserPayload(values: NewUserValues, canCreateAdmin: boolean) {
  const name = values.name.trim().replace(/\s+/g, " ");
  const email = values.email.trim().toLowerCase();
  const role: RequestedRole = canCreateAdmin && values.role === "admin" ? "admin" : "student";
  if (name.length < 2 || name.length > NAME_MAX) throw new UserFormError(`Informe um nome com 2 a ${NAME_MAX} caracteres.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserFormError("Informe um e-mail válido.");
  if (values.password !== values.confirmation) throw new UserFormError("A confirmação não confere com a senha inicial.");
  if (values.password.length < PASSWORD_MIN[role] || values.password.length > PASSWORD_MAX) {
    throw new UserFormError(`A senha inicial precisa ter de ${PASSWORD_MIN[role]} a ${PASSWORD_MAX} caracteres.`);
  }
  if (role === "student" && values.grantAccess) {
    const startDate = values.accessStart ?? "";
    const endDate = values.accessEnd ?? "";
    if (!grantPeriod(startDate, endDate, new Date())) throw new UserFormError(ACCESS_PERIOD_MESSAGE);
    return { name, email, role, password: values.password, access: { startDate, endDate } };
  }
  return { name, email, role, password: values.password };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Random initial password generated in the browser (rejection sampling, no modulo bias). Never stored. */
export function generateInitialPassword(length = 16, random: (array: Uint8Array) => Uint8Array = array => crypto.getRandomValues(array)) {
  const limit = 256 - (256 % ALPHABET.length);
  let result = "";
  while (result.length < length) {
    for (const byte of random(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) result += ALPHABET[byte % ALPHABET.length];
    }
  }
  return result;
}

const messages: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: "Já existe uma conta com este e-mail.",
  PRINCIPAL_ADMIN_REQUIRED: "Somente os administradores principais podem criar ou alterar administradores.",
  PROTECTED_ACCOUNT: "Esta conta é protegida e não pode ser alterada pelo painel.",
  ROLE_UNCHANGED: "A conta já tem este tipo de acesso.",
  USER_DISABLED: "Contas desativadas não podem receber acesso de administrador nem liberação de conteúdos.",
  USER_CONFLICT: "A conta foi alterada por outra pessoa. Atualize a lista e tente novamente.",
  USER_NOT_FOUND: "Conta não encontrada. Atualize a lista.",
  INVALID_USER: "Revise os dados informados.",
  INVALID_PASSWORD: "A senha não atende ao tamanho exigido.",
  INVALID_CURRENT_PASSWORD: "A senha atual está incorreta.",
  PASSWORD_UNCHANGED: "A nova senha precisa ser diferente da atual.",
  PASSWORD_CHANGE_REQUIRED: "Troque sua senha inicial antes de continuar.",
  INVALID_ORIGIN: "Requisição recusada. Recarregue a página e tente novamente.",
  INVALID_ACCESS: "Revise o período de acesso informado.",
  INVALID_ACCESS_PERIOD: ACCESS_PERIOD_MESSAGE,
  ACCESS_ALREADY_ACTIVE: "Este aluno já tem uma liberação vigente ou agendada. Use Renovar.",
  ACCESS_NOT_ACTIVE: "Não há liberação vigente para renovar ou revogar. Atualize a lista.",
  ACCESS_CONFLICT: "A liberação foi alterada por outra pessoa. Atualize a lista e tente novamente.",
  ACCESS_TARGET_NOT_STUDENT: "A liberação manual de acesso é exclusiva para contas de aluno.",
  NETWORK_ERROR: "Sem conexão com o servidor. Tente novamente.",
};

export function userErrorMessage(status: number, code?: string) {
  if (code && messages[code]) return messages[code];
  if (status === 401) return "Sua sessão expirou. Entre novamente.";
  if (status === 403) return "Você não tem permissão para esta ação.";
  return "Não foi possível concluir agora. Tente novamente em instantes.";
}
