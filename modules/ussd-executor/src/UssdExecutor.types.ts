export type UssdResultPayload = {
  result: string;
};

export type UssdExecutorModuleEvents = {
  onUssdResult: (params: UssdResultPayload) => void;
};
