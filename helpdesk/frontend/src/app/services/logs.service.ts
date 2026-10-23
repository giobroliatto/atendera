import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RespostaLogs } from '../models/log.model';

@Injectable({ providedIn: 'root' })
export class LogsService {
  private baseUrl = 'http://localhost:3000/logs';

  constructor(private http: HttpClient) {}

  listar(agente?: string, limit = 100): Observable<RespostaLogs> {
    let params = new HttpParams().set('limit', limit);
    if (agente) params = params.set('agente', agente);
    return this.http.get<RespostaLogs>(this.baseUrl, { params });
  }
}
