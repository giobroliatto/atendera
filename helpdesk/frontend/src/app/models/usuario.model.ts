export interface Usuario {
  id: number;
  nome: string;
  email: string;
}

export interface RespostaLogin {
  token: string;
  usuario: Usuario;
}
