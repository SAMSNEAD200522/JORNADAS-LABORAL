import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  const mockResponse = () => {
    const res: Record<string, unknown> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res;
  };

  const mockRequest = (url = '/test') => ({ url });

  const mockHost = (req: unknown, res: unknown) =>
    ({
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => req,
      }),
    }) as any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('debe manejar HttpException con response de objeto', () => {
    const exception = new HttpException(
      { message: 'Recurso no encontrado', code: 'NOT_FOUND' },
      HttpStatus.NOT_FOUND,
    );
    const res = mockResponse();
    const req = mockRequest();
    const host = mockHost(req, res);

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        mensaje: 'Recurso no encontrado',
        codigo: 'NOT_FOUND',
        path: '/test',
      }),
    );
  });

  it('debe manejar HttpException con response de string', () => {
    const exception = new HttpException('Mensaje directo', HttpStatus.FORBIDDEN);
    const res = mockResponse();
    const req = mockRequest();
    const host = mockHost(req, res);

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        mensaje: 'Mensaje directo',
      }),
    );
  });

  it('debe manejar HttpException sin campo code usando HTTP_<status>', () => {
    const exception = new HttpException(
      { message: 'Bad request' },
      HttpStatus.BAD_REQUEST,
    );
    const res = mockResponse();
    const req = mockRequest();
    const host = mockHost(req, res);

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        mensaje: 'Bad request',
        codigo: 'HTTP_400',
      }),
    );
  });

  it('debe manejar Error genérico con status 500', () => {
    const exception = new Error('Algo falló');
    const res = mockResponse();
    const req = mockRequest();
    const host = mockHost(req, res);

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        mensaje: 'Error interno del servidor',
        codigo: 'ERROR_INTERNO',
        path: '/test',
      }),
    );
  });

  it('debe manejar excepción desconocida (no Error) con status 500', () => {
    const exception = 'error inesperado';
    const res = mockResponse();
    const req = mockRequest();
    const host = mockHost(req, res);

    filter.catch(exception, host);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        mensaje: 'Error interno del servidor',
        codigo: 'ERROR_INTERNO',
      }),
    );
  });

  it('debe incluir timestamp ISO en la respuesta', () => {
    const exception = new HttpException('test', HttpStatus.OK);
    const res = mockResponse();
    const req = mockRequest();
    const host = mockHost(req, res);

    filter.catch(exception, host);

    const callArg = (res.json as jest.Mock).mock.calls[0][0];
    expect(callArg.timestamp).toBeDefined();
    expect(new Date(callArg.timestamp).toISOString()).toBe(callArg.timestamp);
  });

  it('debe incluir la URL de la request en path', () => {
    const exception = new HttpException('test', HttpStatus.OK);
    const res = mockResponse();
    const req = mockRequest('/api/users');
    const host = mockHost(req, res);

    filter.catch(exception, host);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/users' }),
    );
  });
});
