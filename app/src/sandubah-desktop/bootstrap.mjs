import {showStartupError} from './startup-error.mjs';

import('./app.mjs').catch(showStartupError);
