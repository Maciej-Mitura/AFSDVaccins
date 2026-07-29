import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common'

/**
 * Phase 34A route voice-report errors — stable `error` codes.
 * Never include Azure messages, blob URLs, tokens, or audio bytes.
 */

export class RouteVoiceReportRouteNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Bezorgroute niet gevonden.',
      error: 'ROUTE_VOICE_REPORT_ROUTE_NOT_FOUND',
    })
  }
}

export class RouteVoiceReportForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Je hebt geen toegang tot spraakrapporten voor deze route.',
      error: 'ROUTE_VOICE_REPORT_FORBIDDEN',
    })
  }
}

export class RouteVoiceReportRouteNotInProgressException extends BadRequestException {
  constructor() {
    super({
      message:
        'Spraakrapporten kunnen alleen worden geüpload terwijl de route bezig is.',
      error: 'ROUTE_VOICE_REPORT_ROUTE_NOT_IN_PROGRESS',
    })
  }
}

export class RouteVoiceReportStopIdRequiredException extends BadRequestException {
  constructor() {
    super({
      message:
        'Een stop-id is verplicht voor nieuwe spraakrapporten. Oude route-only uploads worden niet meer geaccepteerd.',
      error: 'ROUTE_VOICE_REPORT_STOP_ID_REQUIRED',
    })
  }
}

export class RouteVoiceReportStopNotFoundException extends BadRequestException {
  constructor() {
    super({
      message: 'Stop hoort niet bij deze route of bestaat niet.',
      error: 'ROUTE_VOICE_REPORT_STOP_NOT_FOUND',
    })
  }
}

export class RouteVoiceReportStopInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldige stop-id voor spraakrapport.',
      error: 'ROUTE_VOICE_REPORT_STOP_INVALID',
    })
  }
}

export class RouteVoiceReportLimitReachedException extends ConflictException {
  constructor() {
    super({
      message: 'Het maximumaantal spraakrapporten voor deze route is bereikt.',
      error: 'ROUTE_VOICE_REPORT_LIMIT_REACHED',
    })
  }
}

export class RouteVoiceReportAudioRequiredException extends BadRequestException {
  constructor() {
    super({
      message: 'Audiobestand is verplicht (multipart veld "audio").',
      error: 'ROUTE_VOICE_REPORT_AUDIO_REQUIRED',
    })
  }
}

export class RouteVoiceReportAudioEmptyException extends BadRequestException {
  constructor() {
    super({
      message: 'Audiobestand mag niet leeg zijn.',
      error: 'ROUTE_VOICE_REPORT_AUDIO_EMPTY',
    })
  }
}

export class RouteVoiceReportAudioTooLargeException extends PayloadTooLargeException {
  constructor() {
    super({
      message: 'Audiobestand is te groot (maximaal 10 MiB).',
      error: 'ROUTE_VOICE_REPORT_AUDIO_TOO_LARGE',
    })
  }
}

export class RouteVoiceReportAudioTypeUnsupportedException extends UnsupportedMediaTypeException {
  constructor() {
    super({
      message: 'Audiotype wordt niet ondersteund.',
      error: 'ROUTE_VOICE_REPORT_AUDIO_TYPE_UNSUPPORTED',
    })
  }
}

export class RouteVoiceReportAudioSignatureInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Audiobestand-handtekening is ongeldig.',
      error: 'ROUTE_VOICE_REPORT_AUDIO_SIGNATURE_INVALID',
    })
  }
}

export class RouteVoiceReportDurationInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Gedeclareerde opnameduur is ongeldig (1–180 seconden).',
      error: 'ROUTE_VOICE_REPORT_DURATION_INVALID',
    })
  }
}

export class RouteVoiceReportTimestampInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldig opnametijdstip van het apparaat.',
      error: 'ROUTE_VOICE_REPORT_TIMESTAMP_INVALID',
    })
  }
}

export class RouteVoiceReportIdempotencyConflictException extends ConflictException {
  constructor() {
    super({
      message:
        'Idempotency-sleutel conflicteert met een eerdere upload of payload.',
      error: 'ROUTE_VOICE_REPORT_IDEMPOTENCY_CONFLICT',
    })
  }
}

export class RouteVoiceReportNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Spraakrapport niet gevonden.',
      error: 'ROUTE_VOICE_REPORT_NOT_FOUND',
    })
  }
}

export class RouteVoiceReportNotAvailableException extends GoneException {
  constructor() {
    super({
      message: 'Spraakrapport is niet beschikbaar voor weergave.',
      error: 'ROUTE_VOICE_REPORT_NOT_AVAILABLE',
    })
  }
}

export class RouteVoiceReportRangeInvalidException extends HttpException {
  constructor(totalSize: number) {
    super(
      {
        message: 'Ongeldig of niet-ondersteund Range-verzoek.',
        error: 'ROUTE_VOICE_REPORT_RANGE_INVALID',
        totalSize,
      },
      HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
    )
  }
}

export class RouteVoiceReportStorageFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Opslaan van spraakrapport-audio is mislukt.',
      error: 'ROUTE_VOICE_REPORT_STORAGE_FAILED',
    })
  }
}

export class RouteVoiceReportCreationFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Aanmaken van spraakrapport is mislukt.',
      error: 'ROUTE_VOICE_REPORT_CREATION_FAILED',
    })
  }
}

export class RouteVoiceReportStreamFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Streamen van spraakrapport-audio is mislukt.',
      error: 'ROUTE_VOICE_REPORT_STREAM_FAILED',
    })
  }
}

export class RouteVoiceReportLocaleInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldige of te lange locale.',
      error: 'ROUTE_VOICE_REPORT_LOCALE_INVALID',
    })
  }
}

export class RouteVoiceReportClientUploadIdInvalidException extends BadRequestException {
  constructor() {
    super({
      message: 'Ongeldige clientUploadId.',
      error: 'ROUTE_VOICE_REPORT_CLIENT_UPLOAD_ID_INVALID',
    })
  }
}

/** Phase 34B transcription errors — stable codes; never Azure raw messages. */

export class RouteVoiceTranscriptionForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'Je mag transcriptie voor dit spraakrapport niet opnieuw starten.',
      error: 'ROUTE_VOICE_TRANSCRIPTION_FORBIDDEN',
    })
  }
}

export class RouteVoiceTranscriptionNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Spraakrapport voor transcriptie niet gevonden.',
      error: 'ROUTE_VOICE_TRANSCRIPTION_NOT_FOUND',
    })
  }
}

export class RouteVoiceTranscriptionAlreadyCompletedException extends ConflictException {
  constructor() {
    super({
      message: 'Transcriptie is al voltooid.',
      error: 'ROUTE_VOICE_TRANSCRIPTION_ALREADY_COMPLETED',
    })
  }
}

export class RouteVoiceTranscriptionAlreadyProcessingException extends ConflictException {
  constructor() {
    super({
      message: 'Transcriptie is al bezig.',
      error: 'ROUTE_VOICE_TRANSCRIPTION_ALREADY_PROCESSING',
    })
  }
}

export class RouteVoiceTranscriptionRetryNotAllowedException extends BadRequestException {
  constructor() {
    super({
      message: 'Transcriptie opnieuw starten is niet toegestaan voor deze status.',
      error: 'ROUTE_VOICE_TRANSCRIPTION_RETRY_NOT_ALLOWED',
    })
  }
}
