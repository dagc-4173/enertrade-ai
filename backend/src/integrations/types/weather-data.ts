export type WeatherVariable =
  | 'ghi'
  | 'dni'
  | 'dhi'
  | 'temperature'
  | 'wind_speed'
  | 'wind_direction'
  | 'relative_humidity'
  | 'pressure'
  | 'precipitation'
  | 'cloud_cover';

export type GeoCoordinates = {
  latitude: number;
  longitude: number;
  elevationM?: number;
};

export type WeatherTimeStandard = 'UTC' | 'LOCAL_SOLAR' | 'AMERICA_BOGOTA';

export type WeatherUnit = 'W/m2' | 'degC' | 'm/s' | 'degree' | 'percent' | 'kPa' | 'mm';

export type WeatherRange = {
  start: string;
  end: string;
};

export type WeatherProviderQuery = {
  coordinates: GeoCoordinates;
  range: WeatherRange;
  variables: WeatherVariable[];
  requestedTimeStandard?: WeatherTimeStandard;
};

export type WeatherObservation = {
  // timestampUtc is the normalized instant; providerTimestamp preserves the source value.
  timestampUtc: string;
  providerTimestamp: string;
  values: Partial<Record<WeatherVariable, number | null>>;
};

export type WeatherProvenance = {
  providerId: string;
  providerVersion: string;
  logicalEndpoint: string;
  retrievedAt: string;
  sourceTimeStandard: WeatherTimeStandard;
  normalizerId: string;
  normalizerVersion: string;
  sourceUnits?: Partial<Record<WeatherVariable, string>>;
  rawSnapshotHash?: string;
  sourceDataset?: string;
};

export type WeatherResponseMetadata = {
  format?: string;
  sourceResolution?: string;
};

export type WeatherDataResult = {
  provider: {
    id: string;
    version: string;
  };
  query: WeatherProviderQuery;
  observations: WeatherObservation[];
  units: Partial<Record<WeatherVariable, WeatherUnit>>;
  provenance: WeatherProvenance;
  responseMetadata?: WeatherResponseMetadata;
};

export interface WeatherDataProvider {
  readonly id: string;
  readonly version: string;
  query(query: WeatherProviderQuery): Promise<WeatherDataResult>;
}

// LOCAL_SOLAR is not necessarily the civil time zone of the observation location.
// null means the provider reported a missing value; absence means not requested or not applicable.
// Zero is a measured value, not a missing-value marker. Units and provenance are explicit.
// Provenance must never contain credentials, tokens, cookies, or authorization headers.
